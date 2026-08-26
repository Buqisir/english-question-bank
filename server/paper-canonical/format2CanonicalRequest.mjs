import {
  resolveCanonicalAuthority,
  slotsForProfile,
} from '../../shared/paper-canonical/authority.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import {
  format2VisualMediaId,
  format2VisualSourceObservationId,
  format2VisualSourceSpanId,
} from './format2VisualIdentity.mjs'
import {
  format2CandidateAuthorityRefForTranscription,
  inspectFormat2SourceFidelity,
} from './format2SourceFidelity.mjs'

const encoder = new TextEncoder()

function format2CanonicalError(code, message, diagnostics = []) {
  const error = new Error(message)
  error.code = code
  error.diagnostics = diagnostics.length > 0
    ? diagnostics
    : [{ code, message }]
  return error
}

function clone(value) {
  return structuredClone(value)
}

function format2SourceRegionSpanId(sourceRegionRef) {
  return `source-span:observation:format2-source-region:${sourceRegionRef}`
}

function exactSourceSpan(sourceFidelity, sourceRegionRefs, fallbackLength) {
  if (sourceFidelity.legacy) return { start: 0, end: fallbackLength }
  const sourceSpanId = format2SourceRegionSpanId(sourceRegionRefs[0])
  const observation = sourceFidelity.sourceObservations.find(
    (candidate) => `source-span:${candidate.observationId}` === sourceSpanId,
  )
  if (!observation) {
    throw format2CanonicalError(
      'FORMAT2_CANONICAL_SOURCE_FIDELITY_INVALID',
      `Validated source region ${sourceRegionRefs[0]} has no admitted observation`,
    )
  }
  return clone(observation.span)
}

function text(nodeId, value) {
  return { kind: 'text', nodeId, text: String(value) }
}

function paragraph(nodeId, value) {
  return {
    kind: 'paragraph',
    nodeId,
    inlines: [text(`text:${nodeId}`, value)],
  }
}

function sourceParagraphBlock(block, identity) {
  return {
    kind: 'paragraph',
    nodeId: identity.nodeId,
    inlines: block.inlines.map((inline, index) => text(
      identity.inlines[index].nodeId,
      inline.text,
    )),
  }
}

function tableBlock(block, identity = null) {
  const width = block.rows[0].length
  return {
    kind: 'table',
    nodeId: identity?.nodeId || block.blockId,
    columnCount: width,
    rows: block.rows.map((values, rowIndex) => ({
      rowId: identity?.rows[rowIndex].rowId
        || `row:${block.blockId}:${rowIndex + 1}`,
      cells: values.map((value, columnIndex) => ({
        cellId: identity?.rows[rowIndex].cells[columnIndex].cellId
          || `cell:${block.blockId}:${rowIndex + 1}:${columnIndex + 1}`,
        columnStart: columnIndex,
        columnSpan: 1,
        rowSpan: 1,
        role: 'data',
        inlines: [text(
          identity?.rows[rowIndex].cells[columnIndex].inlineNodeId
            || `text:${block.blockId}:${rowIndex + 1}:${columnIndex + 1}`,
          value,
        )],
      })),
    })),
  }
}

function framedColumnsBlock(block, identity = null) {
  return {
    kind: 'framed_columns',
    nodeId: identity?.nodeId || block.blockId,
    columnCount: 2,
    columns: block.columns.map((column, columnIndex) => {
      const columnIdentity = identity?.columns[columnIndex]
      const columnId = columnIdentity?.columnId || column.columnId
      if (column.blocks) {
        const blocks = column.blocks.map((child, childIndex) => {
          const childIdentity = columnIdentity.blocks[childIndex]
          return child.kind === 'source_table'
            ? tableBlock(child, childIdentity)
            : sourceParagraphBlock(child, childIdentity)
        })
        return {
          columnId,
          ...(column.columnHeadingBlockRef
            ? { columnHeading: columnIdentity.heading.nodeId }
            : {}),
          blocks,
        }
      }
      const blocks = []
      if (column.heading) {
        blocks.push(paragraph(
          columnIdentity?.heading.nodeId || `paragraph:${column.columnId}:heading`,
          column.heading,
        ))
      }
      blocks.push(...column.paragraphs.map((value, index) => (
        paragraph(
          columnIdentity?.paragraphs[index].nodeId
            || `paragraph:${column.columnId}:${index + 1}`,
          value,
        )
      )))
      return {
        columnId,
        ...(column.heading
          ? {
              columnHeading: columnIdentity?.heading.nodeId
                || `paragraph:${column.columnId}:heading`,
            }
          : {}),
        blocks,
      }
    }),
  }
}

function stableArtifactId(artifact) {
  return `source-document:${digestJson({ sha256: artifact.sha256 }).slice('sha256:'.length, 28)}`
}

function visualMedia(visual, artifact) {
  return {
    mediaId: format2VisualMediaId(visual),
    mimeType: 'image/png',
    sha256: artifact.sha256,
    pixelWidth: artifact.pixelWidth,
    pixelHeight: artifact.pixelHeight,
    sourceArtifactRef: { artifactId: stableArtifactId(artifact) },
  }
}

function contentForGroup(group, selectedByObservation, identities = null) {
  const blocks = []
  const media = []
  for (const [blockIndex, block] of group.blocks.entries()) {
    const identity = identities?.blocks[blockIndex]
    if (block.kind === 'text') {
      blocks.push(paragraph(identity?.nodeId || block.blockId, block.text))
    } else if (block.kind === 'table') {
      blocks.push(tableBlock(block, identity))
    } else if (block.kind === 'framed_columns') {
      blocks.push(framedColumnsBlock(block, identity))
    } else if (block.kind === 'visual_placeholder') {
      const selected = selectedByObservation.get(block.visualObservationId)
      if (!selected) {
        throw format2CanonicalError(
          'FORMAT2_CANONICAL_VISUAL_SELECTION_MISSING',
          `Passage Figure ${block.visualObservationId} lacks an exact confirmed selection`,
        )
      }
      const visual = selected.visual
      const item = visualMedia(visual, selected.selection.artifact)
      media.push(item)
      blocks.push({
        kind: 'figure',
        nodeId: identity?.nodeId || block.blockId,
        mediaId: item.mediaId,
        caption: block.captionProvision?.provision === 'source_caption'
          ? [text(identity.captionInlineNodeId, block.captionProvision.text)]
          : [],
      })
    } else if (block.kind === 'writing_material') {
      if (block.promptBlocks || block.materialBlocks) {
        blocks.push(...(block.promptBlocks || []).map((sourceBlock, index) => (
          sourceParagraphBlock(sourceBlock, identity.promptBlocks[index])
        )))
        blocks.push(...(block.materialBlocks || []).map((sourceBlock, index) => (
          sourceParagraphBlock(sourceBlock, identity.materialBlocks[index])
        )))
        if (block.applicationGiven?.provision === 'source_provided') {
          blocks.push(...block.applicationGiven.parts.map((part, index) => (
            paragraph(identity.givenParts[index].nodeId, part.text)
          )))
        }
        blocks.push(...(block.continuationStarters || []).map((starter, index) => (
          sourceParagraphBlock(starter.block, identity.starters[index])
        )))
        continue
      }
      blocks.push(paragraph(identity?.nodeId || block.blockId, block.prompt))
      if (block.applicationEvidence) {
        const evidence = block.applicationEvidence
        const evidenceIdentity = identity?.evidence
        blocks.push(
          paragraph(evidenceIdentity?.writerRole.nodeId
            || `${block.blockId}:evidence:writer-role`, evidence.writerRole),
          paragraph(evidenceIdentity?.audienceOrDestination.nodeId
            || `${block.blockId}:evidence:audience`, evidence.audienceOrDestination),
          paragraph(evidenceIdentity?.deliverable.nodeId
            || `${block.blockId}:evidence:deliverable`, evidence.deliverable),
          paragraph(evidenceIdentity?.communicativePurpose.nodeId
            || `${block.blockId}:evidence:purpose`, evidence.communicativePurpose),
          paragraph(evidenceIdentity?.wordCount.nodeId
            || `${block.blockId}:evidence:word-count`, String(block.wordCountTarget)),
          ...evidence.contentRequirements.map((requirement, index) => paragraph(
            evidenceIdentity?.contentRequirements[index].nodeId
              || `${block.blockId}:evidence:requirement:${index + 1}`,
            requirement,
          )),
        )
      }
      if (block.applicationGiven?.provision === 'source_provided') {
        blocks.push(...block.applicationGiven.parts.map((part, index) => (
          paragraph(identity?.givenParts[index].nodeId || part.blockId, part.text)
        )))
      }
      for (const [index, starter] of (block.continuationStarters || []).entries()) {
        blocks.push(paragraph(
          identity?.starters[index].nodeId || `${block.blockId}:starter:${index + 1}`,
          starter,
        ))
      }
    }
  }
  return { content: { blocks }, media }
}

function questionAnswerMap(transcription) {
  return new Map(transcription.officialAnswers.map((answer) => [
    answer.questionId,
    answer,
  ]))
}

function readingVariant(group, answerByQuestion, selectedByObservation) {
  return {
    family: 'reading',
    passageBlockRoles: [],
    questions: group.questions.map((question) => ({
      questionId: question.questionId,
      stem: [text(`text:${question.questionId}:stem`, question.stem)],
      correctOptionId: question.options.find(
        (option) => option.label === answerByQuestion.get(question.questionId).answer,
      ).optionId,
    })),
    choiceOwnership: {
      ownership: 'per_question',
      sets: group.questions.map((question) => ({
        questionId: question.questionId,
        options: question.options.map((option) => {
          if (option.contentKind === 'text') {
            return {
              optionId: option.optionId,
              label: option.label,
              content: [text(`text:${option.optionId}`, option.text)],
            }
          }
          const selected = selectedByObservation.get(option.visualObservationId)
          if (!selected) {
            throw format2CanonicalError(
              'FORMAT2_CANONICAL_VISUAL_SELECTION_MISSING',
              `Reading Option ${option.optionId} lacks an exact confirmed selection`,
            )
          }
          return {
            optionId: option.optionId,
            label: option.label,
            figure: { mediaId: format2VisualMediaId(selected.visual) },
          }
        }),
      })),
    },
  }
}

function sevenChoicesVariant(group, answerByQuestion, sourceFidelity) {
  const bank = group.questions[0].options
  const expected = JSON.stringify(bank.map(({ optionId, label, text: value }) => ({
    ...(sourceFidelity.legacy ? {} : { optionId }),
    label,
    text: value,
  })))
  if (group.questions.some((question) => (
    JSON.stringify(question.options.map(({ optionId, label, text: value }) => ({
      ...(sourceFidelity.legacy ? {} : { optionId }),
      label,
      text: value,
    }))) !== expected
  ))) {
    throw format2CanonicalError(
      'FORMAT2_CANONICAL_SEVEN_CHOICES_BANK_INVALID',
      'Seven Choices questions must bind one exact shared A-G option bank',
    )
  }
  return {
    family: 'seven-choices',
    choiceOwnership: {
      ownership: 'shared_bank',
      bankId: `bank:${group.groupId}`,
      options: bank.map((option) => ({
        optionId: sourceFidelity.legacy
          ? `option:${group.groupId}:${option.label}`
          : option.optionId,
        label: option.label,
        content: [text(`text:${group.groupId}:option:${option.label}`, option.text)],
      })),
    },
    members: group.questions.map((question, index) => ({
      questionId: question.questionId,
      blankId: `blank:${question.questionId}`,
      answer: {
        optionId: sourceFidelity.legacy
          ? `option:${group.groupId}:${answerByQuestion.get(question.questionId).answer}`
          : bank.find(
              (option) => option.label === answerByQuestion.get(question.questionId).answer,
            ).optionId,
        authorityAssertionRef: `answer:${question.questionId}`,
      },
    })),
  }
}

function objectiveContent(group, family) {
  const sourceText = group.blocks
    .filter((block) => block.kind === 'text')
    .map((block) => block.text)
    .join(' ')
  return {
    blocks: [{
      kind: 'paragraph',
      nodeId: `paragraph:${group.groupId}:content`,
      inlines: [
        ...(sourceText ? [text(`text:${group.groupId}:content`, sourceText)] : []),
        ...group.questions.flatMap((question, index) => [
          {
            kind: 'blank_ref',
            nodeId: `blank-ref:${family}:${index + 1}:${question.questionId}`,
            blankId: `blank:${question.questionId}`,
          },
          ...(question.promptProvision?.provision === 'source_prompt'
            ? [text(
                `text:${question.questionId}:source-prompt`,
                ` (${question.promptProvision.prompt})`,
              )]
            : []),
        ]),
      ],
    }],
  }
}

function ordinaryVariant(group, family) {
  if (family === 'grammar-fill') {
    return {
      family,
      choiceOwnership: { ownership: 'none' },
      promptBindings: group.questions.map((question) => {
        const promptProvision = question.promptProvision || {
          provision: 'source_proven_none',
        }
        return {
          blankId: `blank:${question.questionId}`,
          provision: promptProvision.provision,
          ...(promptProvision.provision === 'source_prompt'
            ? { prompt: promptProvision.prompt }
            : {}),
          authorityObservationRef: `observation:grammar-fill-prompt:${question.questionId}`,
        }
      }),
    }
  }
  if (family === 'cloze') {
    return {
      family,
      choiceOwnership: {
        ownership: 'per_question',
        sets: group.questions.map((question) => ({
          questionId: question.questionId,
          options: question.options.map((option) => ({
            optionId: option.optionId,
            label: option.label,
            content: [text(`text:${option.optionId}`, option.text)],
          })),
        })),
      },
    }
  }
  return { family, choiceOwnership: { ownership: 'none' } }
}

function v4WritingContentRef(block, identity, sourceRef) {
  const sourceBlocks = [
    ...(block.promptBlocks || []).map((sourceBlock, index) => ({
      sourceBlock,
      canonical: identity.promptBlocks[index],
    })),
    ...(block.materialBlocks || []).map((sourceBlock, index) => ({
      sourceBlock,
      canonical: identity.materialBlocks[index],
    })),
    ...(block.continuationStarters || []).map((starter, index) => ({
      sourceBlock: starter.block,
      canonical: identity.starters[index],
    })),
  ]
  const match = sourceBlocks.find(({ sourceBlock }) => (
    sourceBlock.blockId === sourceRef.blockId
  ))
  if (!match) {
    throw format2CanonicalError(
      'FORMAT2_CANONICAL_WRITING_SOURCE_REFERENCE_INVALID',
      `Writing source block ${sourceRef.blockId} was not validated in this group`,
    )
  }
  return {
    blockId: match.canonical.nodeId,
    inlineNodeIds: sourceRef.contentIds.map((contentId) => {
      const index = match.sourceBlock.inlines.findIndex(
        (inline) => inline.contentId === contentId,
      )
      if (index < 0) {
        throw format2CanonicalError(
          'FORMAT2_CANONICAL_WRITING_SOURCE_REFERENCE_INVALID',
          `Writing source content ${contentId} was not validated in ${sourceRef.blockId}`,
        )
      }
      return match.canonical.inlines[index].nodeId
    }),
  }
}

function v4WritingSourceRegionRefs(block, sourceRef) {
  const sourceBlocks = [
    ...(block.promptBlocks || []),
    ...(block.materialBlocks || []),
    ...(block.continuationStarters || []).map((starter) => starter.block),
  ]
  const sourceBlock = sourceBlocks.find((candidate) => candidate.blockId === sourceRef.blockId)
  return sourceRef.contentIds.flatMap((contentId) => (
    sourceBlock.inlines.find((inline) => inline.contentId === contentId).sourceRegionRefs
  ))
}

function writingVariant(group, family, identities = null) {
  const blockIndex = group.blocks.findIndex(
    (candidate) => candidate.kind === 'writing_material',
  )
  const block = group.blocks.find((candidate) => candidate.kind === 'writing_material')
  const identity = identities?.blocks[blockIndex]
  const wordCountTarget = block.wordCountTarget
  if (!Number.isInteger(wordCountTarget)) {
    throw format2CanonicalError(
      'FORMAT2_CANONICAL_WRITING_EVIDENCE_INCOMPLETE',
      `${family} requires one source-backed wordCountTarget`,
    )
  }
  if (block.promptBlocks || block.materialBlocks) {
    if (family === 'application-writing') {
      const evidence = block.applicationEvidence
      const applicationGiven = block.applicationGiven
      return {
        family,
        writingTaskId: identity.writingTaskId,
        promptBlockRefs: identity.promptBlocks.map((promptBlock) => promptBlock.nodeId),
        situation: {
          writerRole: v4WritingContentRef(block, identity, evidence.writerRole),
          audienceOrDestination: v4WritingContentRef(
            block,
            identity,
            evidence.audienceOrDestination,
          ),
          deliverable: v4WritingContentRef(block, identity, evidence.deliverable),
          communicativePurpose: v4WritingContentRef(
            block,
            identity,
            evidence.communicativePurpose,
          ),
        },
        contentRequirements: evidence.contentRequirements.map((sourceRef, index) => ({
          requirementId: `requirement:${group.groupId}:${index + 1}`,
          contentRef: v4WritingContentRef(block, identity, sourceRef),
        })),
        wordCountRuling: {
          kind: 'approximate_target',
          target: wordCountTarget,
          countScope: block.wordCountScope,
          sourceRef: v4WritingContentRef(block, identity, evidence.wordCountSource),
          authorityObservationRef: `observation:${group.groupId}:word-count`,
        },
        givenSkeleton: applicationGiven.provision === 'source_provided'
          ? {
              presence: 'provided',
              parts: applicationGiven.parts.map((part, index) => ({
                givenPartId: identity.givenParts[index].givenPartId,
                role: part.role,
                placement: ['title', 'salutation', 'opening'].includes(part.role)
                  ? 'answer_region_top'
                  : 'answer_region_bottom',
                blockRef: identity.givenParts[index].nodeId,
                authorityAssertionRef: `observation:${group.groupId}:given:${index + 1}`,
              })),
            }
          : {
              presence: 'none',
              answerRegionAbsenceAssertionRef:
                `observation:${group.groupId}:answer-region-empty`,
            },
        choiceOwnership: { ownership: 'none' },
        response: {
          kind: 'group_level_written_response',
          answerRegionRef: 'writing.application-box',
          authorityObservationRef: `observation:${group.groupId}:response`,
        },
      }
    }
    return {
      family,
      writingTaskId: identity.writingTaskId,
      materialBlockRefs: identity.materialBlocks.map((material) => material.nodeId),
      wordCountRuling: {
        kind: 'approximate_target',
        target: wordCountTarget,
        countScope: block.wordCountScope,
        sourceRef: v4WritingContentRef(block, identity, block.wordCountSource),
        authorityObservationRef: `observation:${group.groupId}:word-count`,
      },
      starterProvision: {
        kind: 'ordered_source_starters',
        starters: identity.starters.map((starter, index) => ({
          starterId: starter.starterId,
          contentRef: starter.nodeId,
          authorityObservationRef: `observation:${group.groupId}:starter:${index + 1}`,
        })),
      },
      choiceOwnership: { ownership: 'none' },
      response: {
        kind: 'group_level_written_response',
        answerRegionRef: 'writing.continuation-box',
        authorityObservationRef: `observation:${group.groupId}:response`,
      },
    }
  }
  const contentBlockRefs = group.blocks
    .filter((candidate) => candidate.kind === 'writing_material')
    .flatMap((candidate) => [
      identity?.nodeId || candidate.blockId,
      ...(candidate.continuationStarters || []).map(
        (_starter, index) => identity?.starters[index].nodeId
          || `${candidate.blockId}:starter:${index + 1}`,
      ),
    ])
  if (family === 'continuation-writing' && contentBlockRefs.length !== 3) {
    throw format2CanonicalError(
      'FORMAT2_CANONICAL_WRITING_EVIDENCE_INCOMPLETE',
      'Continuation Writing requires exactly two source-backed paragraph starters',
    )
  }
  if (family === 'application-writing') {
    const evidence = block.applicationEvidence
    const evidenceIdentity = identity?.evidence
    const contentRef = (key, legacySuffix) => ({
      blockId: evidenceIdentity?.[key].nodeId
        || `${block.blockId}:evidence:${legacySuffix}`,
      inlineNodeIds: [evidenceIdentity?.[key].inlineNodeId
        || `text:${block.blockId}:evidence:${legacySuffix}`],
    })
    const evidenceBlockIds = evidenceIdentity
      ? [
          evidenceIdentity.writerRole.nodeId,
          evidenceIdentity.audienceOrDestination.nodeId,
          evidenceIdentity.deliverable.nodeId,
          evidenceIdentity.communicativePurpose.nodeId,
          evidenceIdentity.wordCount.nodeId,
          ...evidenceIdentity.contentRequirements.map((item) => item.nodeId),
        ]
      : [
          'writer-role',
          'audience',
          'deliverable',
          'purpose',
          'word-count',
          ...evidence.contentRequirements.map(
            (_requirement, index) => `requirement:${index + 1}`,
          ),
        ].map((suffix) => `${block.blockId}:evidence:${suffix}`)
    const applicationGiven = block.applicationGiven || {
      provision: 'source_proven_none',
    }
    return {
      family,
      writingTaskId: identity?.writingTaskId || `writing-task:${group.groupId}`,
      promptBlockRefs: [identity?.nodeId || block.blockId, ...evidenceBlockIds],
      situation: {
        writerRole: contentRef('writerRole', 'writer-role'),
        audienceOrDestination: contentRef('audienceOrDestination', 'audience'),
        deliverable: contentRef('deliverable', 'deliverable'),
        communicativePurpose: contentRef('communicativePurpose', 'purpose'),
      },
      contentRequirements: evidence.contentRequirements.map((_requirement, index) => ({
        requirementId: `requirement:${group.groupId}:${index + 1}`,
        contentRef: evidenceIdentity
          ? {
              blockId: evidenceIdentity.contentRequirements[index].nodeId,
              inlineNodeIds: [
                evidenceIdentity.contentRequirements[index].inlineNodeId,
              ],
            }
          : contentRef(null, `requirement:${index + 1}`),
      })),
      wordCountRuling: {
        kind: 'approximate_target',
        target: wordCountTarget,
        countScope: block.wordCountScope,
        sourceRef: contentRef('wordCount', 'word-count'),
        authorityObservationRef: `observation:${group.groupId}:word-count`,
      },
      givenSkeleton: applicationGiven.provision === 'source_provided'
        ? {
            presence: 'provided',
            parts: applicationGiven.parts.map((part, index) => ({
              givenPartId: identity?.givenParts[index].givenPartId || part.partId,
              role: part.role,
              placement: ['title', 'salutation', 'opening'].includes(part.role)
                ? 'answer_region_top'
                : 'answer_region_bottom',
              blockRef: identity?.givenParts[index].nodeId || part.blockId,
              authorityAssertionRef:
                `observation:${group.groupId}:given:${identity ? index + 1 : part.partId}`,
            })),
          }
        : {
            presence: 'none',
            answerRegionAbsenceAssertionRef:
              `observation:${group.groupId}:answer-region-empty`,
          },
      choiceOwnership: { ownership: 'none' },
      response: {
        kind: 'group_level_written_response',
        answerRegionRef: 'writing.application-box',
        authorityObservationRef: `observation:${group.groupId}:response`,
      },
    }
  }
  return {
    family,
    mode: 'legacy_opaque',
    writingTaskId: identity?.writingTaskId || `writing-task:${group.groupId}`,
    sourceTaskType: 'continuation',
    contentBlockRefs,
    sourceStarterBlockRefs: contentBlockRefs.slice(1),
    wordCountTarget,
    wordCountTargetCertainty: 'explicit_legacy_field',
    wordCountScope: block.wordCountScope,
    choiceOwnership: { ownership: 'none' },
    response: {
      kind: 'generic_response_box',
      answerRegionRef: 'writing.continuation-box',
      ownership: 'product',
    },
  }
}

function instructionEvidence(paperId, questionPdfDigest, instruction, sourceInstruction) {
  if (sourceInstruction === instruction.text) {
    throw format2CanonicalError(
      'FORMAT2_CANONICAL_WRITING_EVIDENCE_INCOMPLETE',
      'Continuation source instruction must preserve the source text before the current profile correction',
    )
  }
  return {
    schemaVersion: 'profile-writing-source-evidence-v1',
    paperId,
    profileId: 'nck1',
    sourceDocumentDigest: questionPdfDigest,
    review: { method: 'manual_source_transcription', status: 'accepted' },
    sourceLocation: {
      kind: 'pdf_page_region',
      page: 1,
      region: { x: 0, y: 0, width: 1, height: 1 },
      locator: 'Format 2 transcription continuation instruction',
    },
    instruction,
    transformationRecord: {
      recordId: `transformation:${paperId}:continuation-instruction`,
      ruleId: 'source-exact-transcription',
      ruleVersion: '1',
      certainty: 'exact',
      before: sourceInstruction,
      after: instruction.text,
      proof: 'Format 2 transcription binds the source instruction verbatim.',
    },
  }
}

function sourceDocument(inputKey, roles, bytes, mediaType, originalName) {
  return {
    inputKey,
    roles,
    bytes: new Uint8Array(bytes),
    declared: { mediaType, originalName },
  }
}

/**
 * Trusted adapter from a validated Format 2 transcription and exact confirmed
 * visual selection into compiler source evidence. It creates no Canonical
 * Paper, paper plan, authority manifest, or publication payload.
 */
export function buildConfirmedFormat2CanonicalRequest({
  transcription,
  questionPdfBytes,
  answerPdfBytes,
  confirmedSelection,
}) {
  const authorityRef = format2CandidateAuthorityRefForTranscription(transcription)
  const authorityResolution = resolveCanonicalAuthority(
    authorityRef,
  )
  if (!authorityResolution.ok) {
    throw format2CanonicalError(
      'FORMAT2_CANONICAL_AUTHORITY_UNAVAILABLE',
      'Closed Format 2 Candidate authority is unavailable',
    )
  }
  const profile = authorityResolution.closure.profiles.get('nck1')
  const sourceFidelityInspection = inspectFormat2SourceFidelity({
    transcription,
    questionDocument: {
      sha256: sha256(questionPdfBytes),
      originalName: transcription.provenance?.questionSource?.originalName
        || 'paper.pdf',
    },
    answerDocument: {
      sha256: sha256(answerPdfBytes),
      originalName: 'answers.pdf',
    },
  })
  if (!sourceFidelityInspection.ok) {
    throw format2CanonicalError(
      'FORMAT2_CANONICAL_SOURCE_FIDELITY_INVALID',
      'Canonical compilation requires one closed Format 2 source-fidelity model',
      sourceFidelityInspection.issues,
    )
  }
  const sourceFidelity = sourceFidelityInspection.model
  const slots = slotsForProfile(profile)
  const activeSlots = slots.filter((slot) => slot.activation === 'canonical_group')
  const groupsBySlot = new Map(transcription.groups
    .filter((group) => group.groupType !== 'listening')
    .map((group) => [group.slotId, group]))
  const missingSlots = activeSlots.filter((slot) => !groupsBySlot.has(slot.slotId))
  if (missingSlots.length > 0 || groupsBySlot.size !== activeSlots.length) {
    throw format2CanonicalError(
      'FORMAT2_CANONICAL_SLOT_CLOSURE_INCOMPLETE',
      'Format 2 transcription must bind every and only active NCK1 slot',
      missingSlots.map((slot) => ({
        code: 'FORMAT2_CANONICAL_SLOT_CLOSURE_INCOMPLETE',
        path: `/groups/${slot.slotId}`,
        message: `Missing ${slot.slotId}`,
      })),
    )
  }
  const answerByQuestion = questionAnswerMap(transcription)
  const visualByObservation = new Map(transcription.visuals.map((visual) => [
    visual.observationId,
    visual,
  ]))
  const selectedByObservation = new Map(confirmedSelection.confirmedSelections.map(
    (selection) => [selection.observationId, {
      selection,
      visual: visualByObservation.get(selection.observationId),
    }],
  ))
  if (
    confirmedSelection.status !== 'confirmed'
    || selectedByObservation.size !== transcription.visuals.length
    || [...selectedByObservation.values()].some((entry) => !entry.visual)
  ) {
    throw format2CanonicalError(
      'FORMAT2_CANONICAL_VISUAL_CONFIRMATION_INCOMPLETE',
      'Canonical compilation requires every and only transcribed visual selection',
    )
  }

  const observations = []
  const assertions = []
  const sourceGroups = []
  const transformations = sourceFidelity.legacy
    ? []
    : clone(sourceFidelity.transformations)
  for (const slot of activeSlots) {
    const group = groupsBySlot.get(slot.slotId)
    const expectedFamily = slot.familyContractRef.id
    const actualFamily = ({
      reading: 'reading',
      seven_choices: 'seven-choices',
      cloze: 'cloze',
      grammar_fill: 'grammar-fill',
      application_writing: 'application-writing',
      continuation_writing: 'continuation-writing',
    })[group.groupType]
    if (actualFamily !== expectedFamily) {
      throw format2CanonicalError(
        'FORMAT2_CANONICAL_SLOT_FAMILY_MISMATCH',
        `${group.groupId} does not match ${slot.slotId}`,
      )
    }
    const expectedCount = slot.questionCardinality.kind === 'one_of'
      ? slot.questionCardinality.counts[0]
      : slot.questionCardinality.count
    if (group.questions.length !== expectedCount) {
      throw format2CanonicalError(
        'FORMAT2_CANONICAL_SLOT_CARDINALITY_INVALID',
        `${slot.slotId} requires exactly ${expectedCount} questions`,
      )
    }
    const observationId = `observation:format2-group:${group.groupId}`
    const sourceSpanId = `source-span:${observationId}`
    if (
      sourceFidelity.legacy
      || !sourceFidelity.sourceSpanRefsByGroupId.has(group.groupId)
    ) {
      observations.push({
        observationId,
        kind: 'fixture_section',
        documentInputKey: 'original_question_source',
        value: slot.slotId,
        span: { start: 0, end: questionPdfBytes.byteLength },
      })
    }
    const questionIds = group.questions.map((question) => question.questionId)
    const blankIds = ['seven-choices', 'cloze', 'grammar-fill'].includes(expectedFamily)
      ? questionIds.map((questionId) => `blank:${questionId}`)
      : []
    const canonicalIdentities = sourceFidelity.legacy
      ? null
      : sourceFidelity.canonicalIdentitiesByGroupId.get(group.groupId)
    const builtContent = contentForGroup(
      group,
      selectedByObservation,
      canonicalIdentities,
    )
    let content = builtContent.content
    let variant
    if (expectedFamily === 'reading') {
      variant = readingVariant(group, answerByQuestion, selectedByObservation)
    } else if (expectedFamily === 'seven-choices') {
      content = sourceFidelity.legacy
        ? objectiveContent(group, expectedFamily)
        : clone(sourceFidelity.objectiveGroupsById.get(group.groupId))
      variant = sevenChoicesVariant(group, answerByQuestion, sourceFidelity)
    } else if (['cloze', 'grammar-fill'].includes(expectedFamily)) {
      content = sourceFidelity.legacy
        ? objectiveContent(group, expectedFamily)
        : clone(sourceFidelity.objectiveGroupsById.get(group.groupId))
      variant = ordinaryVariant(group, expectedFamily)
    } else {
      variant = writingVariant(group, expectedFamily, canonicalIdentities)
    }
    const media = [...builtContent.media]
    for (const visual of transcription.visuals.filter(
      (candidate) => candidate.owner.groupId === group.groupId,
    )) {
      const selected = selectedByObservation.get(visual.observationId)
      const item = visualMedia(visual, selected.selection.artifact)
      if (!media.some((candidate) => candidate.mediaId === item.mediaId)) media.push(item)
    }
    const sourceSpanRefsByTarget = sourceFidelity.legacy
      ? {}
      : clone(sourceFidelity.sourceSpanRefsByGroupId.get(group.groupId) || {})
    for (const visual of transcription.visuals.filter(
      (candidate) => candidate.owner.groupId === group.groupId,
    )) {
      const spanId = format2VisualSourceSpanId(visual)
      const mediaId = format2VisualMediaId(visual)
      sourceSpanRefsByTarget[`media:${mediaId}`] = [spanId]
      if (visual.owner.kind === 'reading_option') {
        sourceSpanRefsByTarget[`option:${visual.owner.optionId}`] = [spanId]
      }
    }
    if (expectedFamily === 'grammar-fill') {
      for (const question of group.questions) {
        const promptObservationId = `observation:grammar-fill-prompt:${question.questionId}`
        const promptProvision = question.promptProvision || {
          provision: 'source_proven_none',
        }
        const promptSourceSpanId = sourceSpanRefsByTarget[
          `prompt_provision:blank:${question.questionId}`
        ]?.[0]
        const promptSourceObservation = sourceFidelity.legacy
          ? null
          : sourceFidelity.sourceObservations.find(
              (candidate) => `source-span:${candidate.observationId}` === promptSourceSpanId,
            )
        observations.push({
          observationId: promptObservationId,
          kind: 'grammar_fill_prompt_provision',
          documentInputKey: 'original_question_source',
          value: {
            blankId: `blank:${question.questionId}`,
            provision: promptProvision.provision,
            ...(promptProvision.provision === 'source_prompt'
              ? { prompt: promptProvision.prompt }
              : {}),
          },
          span: promptSourceObservation
            ? clone(promptSourceObservation.span)
            : { start: 0, end: questionPdfBytes.byteLength },
        })
        sourceSpanRefsByTarget[`prompt_provision:blank:${question.questionId}`] = [
          `source-span:${promptObservationId}`,
        ]
      }
    }
    if (expectedFamily === 'application-writing') {
      const writingBlock = group.blocks.find(
        (block) => block.kind === 'writing_material',
      )
      const writingIdentity = canonicalIdentities?.blocks[
        group.blocks.indexOf(writingBlock)
      ]
      const applicationGiven = writingBlock.applicationGiven || {
        provision: 'source_proven_none',
      }
      if (!sourceFidelity.legacy) {
        for (const [index, requirement] of variant.contentRequirements.entries()) {
          const requirementSourceSpanRefs = (
            writingBlock.promptBlocks
              ? v4WritingSourceRegionRefs(
                  writingBlock,
                  writingBlock.applicationEvidence.contentRequirements[index],
                )
              : writingBlock.applicationEvidence.sourceRegionRefs
          ).map(format2SourceRegionSpanId)
          sourceSpanRefsByTarget[`requirement:${requirement.requirementId}`] = [
            ...requirementSourceSpanRefs,
          ]
        }
      }
      observations.push(
        ...(applicationGiven.provision === 'source_provided'
          ? applicationGiven.parts.map((part, index) => ({
              observationId: `observation:${group.groupId}:given:${canonicalIdentities
                ? index + 1
                : part.partId}`,
              kind: 'application_given_part',
              documentInputKey: 'original_question_source',
              value: {
                groupId: group.groupId,
                givenPartId: writingIdentity?.givenParts[index].givenPartId
                  || part.partId,
                role: part.role,
                placement: ['title', 'salutation', 'opening'].includes(part.role)
                  ? 'answer_region_top'
                  : 'answer_region_bottom',
                blockRef: writingIdentity?.givenParts[index].nodeId || part.blockId,
              },
              span: exactSourceSpan(
                sourceFidelity,
                part.sourceRegionRefs,
                questionPdfBytes.byteLength,
              ),
            }))
          : [{
              observationId: `observation:${group.groupId}:answer-region-empty`,
              kind: 'application_answer_region_absence',
              documentInputKey: 'original_question_source',
              value: {
                groupId: group.groupId,
                answerRegionRef: 'writing.application-box',
              },
              span: exactSourceSpan(
                sourceFidelity,
                applicationGiven.sourceRegionRefs || writingBlock.sourceRegionRefs,
                questionPdfBytes.byteLength,
              ),
            }]),
        {
          observationId: `observation:${group.groupId}:word-count`,
          kind: 'application_word_count_ruling',
          documentInputKey: 'original_question_source',
          value: {
            groupId: group.groupId,
            target: group.blocks.find((block) => block.kind === 'writing_material').wordCountTarget,
            countScope: 'student_authored_only',
          },
          span: exactSourceSpan(
            sourceFidelity,
            writingBlock.promptBlocks
              ? v4WritingSourceRegionRefs(
                  writingBlock,
                  writingBlock.applicationEvidence.wordCountSource,
                )
              : writingBlock.applicationEvidence?.sourceRegionRefs
              || writingBlock.sourceRegionRefs,
            questionPdfBytes.byteLength,
          ),
        },
        {
          observationId: `observation:${group.groupId}:response`,
          kind: 'application_response_binding',
          documentInputKey: 'original_question_source',
          value: {
            groupId: group.groupId,
            writingTaskId: writingIdentity?.writingTaskId
              || `writing-task:${group.groupId}`,
            answerRegionRef: 'writing.application-box',
          },
          span: exactSourceSpan(
            sourceFidelity,
            group.sourceRegionRefs || writingBlock.sourceRegionRefs,
            questionPdfBytes.byteLength,
          ),
        },
      )
    }
    if (expectedFamily === 'continuation-writing' && !sourceFidelity.legacy) {
      const writingBlock = group.blocks.find(
        (block) => block.kind === 'writing_material',
      )
      const writingIdentity = canonicalIdentities.blocks[
        group.blocks.indexOf(writingBlock)
      ]
      if (writingBlock.materialBlocks) {
        observations.push(
          {
            observationId: `observation:${group.groupId}:word-count`,
            kind: 'continuation_word_count_ruling',
            documentInputKey: 'original_question_source',
            value: {
              groupId: group.groupId,
              target: writingBlock.wordCountTarget,
              countScope: writingBlock.wordCountScope,
            },
            span: exactSourceSpan(
              sourceFidelity,
              v4WritingSourceRegionRefs(writingBlock, writingBlock.wordCountSource),
              questionPdfBytes.byteLength,
            ),
          },
          ...writingBlock.continuationStarters.map((starter, index) => ({
            observationId: `observation:${group.groupId}:starter:${index + 1}`,
            kind: 'continuation_source_starter',
            documentInputKey: 'original_question_source',
            value: {
              groupId: group.groupId,
              starterId: writingIdentity.starters[index].starterId,
              contentRef: writingIdentity.starters[index].nodeId,
            },
            span: exactSourceSpan(
              sourceFidelity,
              starter.sourceRegionRefs,
              questionPdfBytes.byteLength,
            ),
          })),
          {
            observationId: `observation:${group.groupId}:response`,
            kind: 'continuation_response_binding',
            documentInputKey: 'original_question_source',
            value: {
              groupId: group.groupId,
              writingTaskId: writingIdentity.writingTaskId,
              answerRegionRef: 'writing.continuation-box',
            },
            span: exactSourceSpan(
              sourceFidelity,
              writingBlock.sourceRegionRefs,
              questionPdfBytes.byteLength,
            ),
          },
        )
      }
    }
    sourceGroups.push({
      groupId: group.groupId,
      slotId: slot.slotId,
      family: expectedFamily,
      questionIds,
      blankIds,
      sourceSpanId: sourceFidelity.legacy
        ? sourceSpanId
        : sourceFidelity.groupSourceSpanRefsByGroupId.get(group.groupId)?.[0]
          || sourceSpanId,
      content,
      media,
      variant,
      sourceSpanRefsByTarget,
      ...(!sourceFidelity.legacy
        ? { transformationRecordIdsByTarget: clone(
            sourceFidelity.transformationRecordIdsByGroupId.get(group.groupId)
              || {},
          ) }
        : {}),
    })
    for (const question of group.questions) {
      const answer = answerByQuestion.get(question.questionId)
      const answerObservationId = `observation:format2-answer:${question.questionId}`
      observations.push({
        observationId: answerObservationId,
        kind: 'official_answer',
        documentInputKey: 'listening_answer_source',
        value: { questionId: question.questionId, answer: answer.answer },
        span: { start: 0, end: answerPdfBytes.byteLength },
      })
      assertions.push({
        assertionId: `answer:${question.questionId}`,
        questionId: question.questionId,
        answer: answer.answer,
        authority: 'official',
        sourceSpanId: `source-span:${answerObservationId}`,
      })
    }
  }

  if (!sourceFidelity.legacy) {
    observations.push(...sourceFidelity.sourceObservations.map((observation) => (
      clone(observation)
    )))
  }

  for (const visual of transcription.visuals) {
    observations.push({
      observationId: format2VisualSourceObservationId(visual),
      kind: 'source_figure',
      documentInputKey: 'original_question_source',
      value: {
        owner: clone(visual.owner),
        pageSizePoints: clone(visual.source.pageSizePoints),
        pointGeometry: clone(visual.source.pointGeometry),
        extraction: clone(visual.source.extraction),
      },
      span: {
        kind: 'page_region',
        page: visual.source.page,
        region: {
          x: visual.source.pointGeometry.x / visual.source.pageSizePoints.width,
          y: visual.source.pointGeometry.y / visual.source.pageSizePoints.height,
          width: visual.source.pointGeometry.width / visual.source.pageSizePoints.width,
          height: visual.source.pointGeometry.height / visual.source.pageSizePoints.height,
        },
      },
    })
  }

  const visualsByQuestionAndOption = new Map()
  for (const visual of transcription.visuals) {
    if (visual.owner.kind !== 'reading_option') continue
    const visualsByOption = visualsByQuestionAndOption.get(
      visual.owner.questionId,
    ) || new Map()
    visualsByOption.set(visual.owner.optionId, visual)
    visualsByQuestionAndOption.set(visual.owner.questionId, visualsByOption)
  }
  for (const layout of transcription.sourceMeasuredFigureLayouts || []) {
    const intent = layout.intent
    const visualsByOption = visualsByQuestionAndOption.get(intent.questionId)
    const visuals = intent.placements.map((placement) => (
      visualsByOption.get(placement.optionId)
    ))
    const page = visuals[0].source.pageSizePoints
    const left = Math.min(...visuals.map((visual) => visual.source.pointGeometry.x))
    const top = Math.min(...visuals.map((visual) => visual.source.pointGeometry.y))
    const right = Math.max(...visuals.map((visual) => (
      visual.source.pointGeometry.x + visual.source.pointGeometry.width
    )))
    const bottom = Math.max(...visuals.map((visual) => (
      visual.source.pointGeometry.y + visual.source.pointGeometry.height
    )))
    observations.push({
      observationId: `observation:format2-source-layout:${intent.questionId}`,
      kind: 'reading_option_figure_source_layout',
      documentInputKey: 'original_question_source',
      value: clone(layout),
      span: {
        kind: 'page_region',
        page: intent.sourcePage,
        region: {
          x: left / page.width,
          y: top / page.height,
          width: (right - left) / page.width,
          height: (bottom - top) / page.height,
        },
      },
    })
  }

  const analysisSidecars = (transcription.analysisSidecars || []).map((analysis) => ({
    schemaVersion: analysis.schemaVersion,
    bytes: encoder.encode(`${JSON.stringify(analysis, null, 2)}\n`),
  }))
  const source = {
    paperId: transcription.paperId,
    profileId: 'nck1',
    sourceAssetVersion: 1,
    profileInstructionSourceDigest: sha256(questionPdfBytes),
    observations,
    assertions,
    groups: sourceGroups,
    transformations,
    inactiveSlots: transcription.listeningSource?.disposition === 'not_supplied'
      ? {
          'listening.short-dialogue': 'not_supplied',
          'listening.long-form': 'not_supplied',
        }
      : {},
    inactiveSourceClosures: [],
  }
  const sourceAsset = encoder.encode(JSON.stringify(source))
  const continuationInstruction = profile.instructions['writing.continuation.prompt']
  const continuationSourceInstruction = transcription.groups
    .find((group) => group.slotId === 'writing.continuation')
    .blocks.find((block) => block.kind === 'writing_material')
    .sourceInstruction
  const instructionBytes = encoder.encode(JSON.stringify(instructionEvidence(
    transcription.paperId,
    sha256(questionPdfBytes),
    continuationInstruction,
    continuationSourceInstruction,
  )))
  const listeningBlock = transcription.groups
    .find((group) => group.groupType === 'listening')
    ?.blocks.find((block) => block.kind === 'listening_material')
  const documents = [
    sourceDocument(
      'canonical_source_envelope',
      ['operator_assertions'],
      sourceAsset,
      'application/vnd.eqb.canonical-fixture+json',
      'format2-source-envelope.json',
    ),
    sourceDocument(
      'original_question_source',
      ['question_source', 'source_provenance'],
      questionPdfBytes,
      'application/pdf',
      'paper.pdf',
    ),
    sourceDocument(
      'listening_answer_source',
      listeningBlock
        ? ['official_answer_source', 'transcript_source', 'source_provenance']
        : ['official_answer_source', 'source_provenance'],
      answerPdfBytes,
      'application/pdf',
      'answers.pdf',
    ),
    ...(!sourceFidelity.legacy
      ? [
          sourceDocument(
            sourceFidelity.provenanceDocument.inputKey,
            sourceFidelity.provenanceDocument.roles,
            sourceFidelity.provenanceDocument.bytes,
            sourceFidelity.provenanceDocument.mediaType,
            sourceFidelity.provenanceDocument.originalName,
          ),
        ]
      : []),
    sourceDocument(
      'continuation_writing_instruction_evidence',
      ['structured_source', 'source_provenance'],
      instructionBytes,
      'application/vnd.eqb.profile-writing-source-evidence+json',
      'continuation-writing-instruction-evidence.json',
    ),
    ...(!sourceFidelity.legacy && listeningBlock
      ? sourceFidelity.supplementalDocuments.map((document) => sourceDocument(
          document.inputKey,
          document.roles,
          document.bytes,
          document.mediaType,
          document.originalName,
        ))
      : listeningBlock
      ? [
          sourceDocument(
            'listening_questions',
            ['structured_source', 'question_source'],
            encoder.encode(JSON.stringify(listeningBlock.questions)),
            'application/vnd.eqb.listening-questions+json',
            'listening-questions.json',
          ),
          sourceDocument(
            'listening_answers',
            ['structured_source', 'official_answer_source'],
            encoder.encode(JSON.stringify(listeningBlock.answers)),
            'application/vnd.eqb.listening-answers+json',
            'listening-answers.json',
          ),
          sourceDocument(
            'listening_transcript',
            ['structured_source', 'transcript_source'],
            encoder.encode(JSON.stringify(listeningBlock.transcript)),
            'application/vnd.eqb.listening-transcript+json',
            'listening-transcript.json',
          ),
          sourceDocument(
            'listening_inventory',
            ['operator_assertions', 'source_provenance'],
            encoder.encode(JSON.stringify(listeningBlock.inventory)),
            'application/vnd.eqb.listening-source-inventory+json',
            'listening-inventory.json',
          ),
        ]
        : []),
    ...confirmedSelection.confirmedSelections.map((selection) => sourceDocument(
      `visual_${selection.observationId}`,
      ['source_provenance'],
      Buffer.from(selection.artifact.encodedBytes, 'base64'),
      'image/png',
      `${selection.observationId}.png`,
    )),
  ]
  return {
    request: {
      authority: authorityRef,
      evidence: { documents },
    },
    sourceAsset,
    analysisSidecars,
  }
}
