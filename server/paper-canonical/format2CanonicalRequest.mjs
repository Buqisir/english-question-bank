import {
  readingOptionFigureAuthorityRef,
  resolveCanonicalAuthority,
  slotsForProfile,
} from '../../shared/paper-canonical/authority.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import {
  format2VisualMediaId,
  format2VisualSourceObservationId,
  format2VisualSourceSpanId,
} from './format2VisualIdentity.mjs'
import { inspectFormat2SourceFidelity } from './format2SourceFidelity.mjs'

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

function tableBlock(block) {
  const width = block.rows[0].length
  return {
    kind: 'table',
    nodeId: block.blockId,
    columnCount: width,
    rows: block.rows.map((values, rowIndex) => ({
      rowId: `row:${block.blockId}:${rowIndex + 1}`,
      cells: values.map((value, columnIndex) => ({
        cellId: `cell:${block.blockId}:${rowIndex + 1}:${columnIndex + 1}`,
        columnStart: columnIndex,
        columnSpan: 1,
        rowSpan: 1,
        role: 'data',
        inlines: [text(
          `text:${block.blockId}:${rowIndex + 1}:${columnIndex + 1}`,
          value,
        )],
      })),
    })),
  }
}

function framedColumnsBlock(block) {
  return {
    kind: 'framed_columns',
    nodeId: block.blockId,
    columnCount: 2,
    columns: block.columns.map((column) => {
      const blocks = []
      if (column.heading) {
        blocks.push(paragraph(`paragraph:${column.columnId}:heading`, column.heading))
      }
      blocks.push(...column.paragraphs.map((value, index) => (
        paragraph(`paragraph:${column.columnId}:${index + 1}`, value)
      )))
      return {
        columnId: column.columnId,
        ...(column.heading
          ? { columnHeading: `paragraph:${column.columnId}:heading` }
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

function contentForGroup(group, selectedByObservation) {
  const blocks = []
  const media = []
  for (const block of group.blocks) {
    if (block.kind === 'text') {
      blocks.push(paragraph(block.blockId, block.text))
    } else if (block.kind === 'table') {
      blocks.push(tableBlock(block))
    } else if (block.kind === 'framed_columns') {
      blocks.push(framedColumnsBlock(block))
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
        nodeId: block.blockId,
        mediaId: item.mediaId,
        caption: [],
      })
    } else if (block.kind === 'writing_material') {
      blocks.push(paragraph(block.blockId, block.prompt))
      if (block.applicationEvidence) {
        const evidence = block.applicationEvidence
        blocks.push(
          paragraph(`${block.blockId}:evidence:writer-role`, evidence.writerRole),
          paragraph(`${block.blockId}:evidence:audience`, evidence.audienceOrDestination),
          paragraph(`${block.blockId}:evidence:deliverable`, evidence.deliverable),
          paragraph(`${block.blockId}:evidence:purpose`, evidence.communicativePurpose),
          paragraph(`${block.blockId}:evidence:word-count`, String(block.wordCountTarget)),
          ...evidence.contentRequirements.map((requirement, index) => paragraph(
            `${block.blockId}:evidence:requirement:${index + 1}`,
            requirement,
          )),
        )
      }
      if (block.applicationGiven?.provision === 'source_provided') {
        blocks.push(...block.applicationGiven.parts.map((part) => (
          paragraph(part.blockId, part.text)
        )))
      }
      for (const [index, starter] of (block.continuationStarters || []).entries()) {
        blocks.push(paragraph(`${block.blockId}:starter:${index + 1}`, starter))
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

function writingVariant(group, family) {
  const block = group.blocks.find((candidate) => candidate.kind === 'writing_material')
  const wordCountTarget = block.wordCountTarget
  if (!Number.isInteger(wordCountTarget)) {
    throw format2CanonicalError(
      'FORMAT2_CANONICAL_WRITING_EVIDENCE_INCOMPLETE',
      `${family} requires one source-backed wordCountTarget`,
    )
  }
  const contentBlockRefs = group.blocks
    .filter((candidate) => candidate.kind === 'writing_material')
    .flatMap((candidate) => [
      candidate.blockId,
      ...(candidate.continuationStarters || []).map(
        (_starter, index) => `${candidate.blockId}:starter:${index + 1}`,
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
    const contentRef = (suffix) => ({
      blockId: `${block.blockId}:evidence:${suffix}`,
      inlineNodeIds: [`text:${block.blockId}:evidence:${suffix}`],
    })
    const evidenceBlockIds = [
      'writer-role',
      'audience',
      'deliverable',
      'purpose',
      'word-count',
      ...evidence.contentRequirements.map((_requirement, index) => `requirement:${index + 1}`),
    ].map((suffix) => `${block.blockId}:evidence:${suffix}`)
    const applicationGiven = block.applicationGiven || {
      provision: 'source_proven_none',
    }
    return {
      family,
      writingTaskId: `writing-task:${group.groupId}`,
      promptBlockRefs: [block.blockId, ...evidenceBlockIds],
      situation: {
        writerRole: contentRef('writer-role'),
        audienceOrDestination: contentRef('audience'),
        deliverable: contentRef('deliverable'),
        communicativePurpose: contentRef('purpose'),
      },
      contentRequirements: evidence.contentRequirements.map((_requirement, index) => ({
        requirementId: `requirement:${group.groupId}:${index + 1}`,
        contentRef: contentRef(`requirement:${index + 1}`),
      })),
      wordCountRuling: {
        kind: 'approximate_target',
        target: wordCountTarget,
        countScope: block.wordCountScope,
        sourceRef: contentRef('word-count'),
        authorityObservationRef: `observation:${group.groupId}:word-count`,
      },
      givenSkeleton: applicationGiven.provision === 'source_provided'
        ? {
            presence: 'provided',
            parts: applicationGiven.parts.map((part) => ({
              givenPartId: part.partId,
              role: part.role,
              placement: ['title', 'salutation', 'opening'].includes(part.role)
                ? 'answer_region_top'
                : 'answer_region_bottom',
              blockRef: part.blockId,
              authorityAssertionRef:
                `observation:${group.groupId}:given:${part.partId}`,
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
    writingTaskId: `writing-task:${group.groupId}`,
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
  const authorityResolution = resolveCanonicalAuthority(
    readingOptionFigureAuthorityRef,
  )
  if (!authorityResolution.ok) {
    throw format2CanonicalError(
      'FORMAT2_CANONICAL_AUTHORITY_UNAVAILABLE',
      'Current Reading Figure Option authority is unavailable',
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
  const transformations = []
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
    const builtContent = contentForGroup(group, selectedByObservation)
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
      variant = writingVariant(group, expectedFamily)
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
      const applicationGiven = writingBlock.applicationGiven || {
        provision: 'source_proven_none',
      }
      observations.push(
        ...(applicationGiven.provision === 'source_provided'
          ? applicationGiven.parts.map((part) => ({
              observationId: `observation:${group.groupId}:given:${part.partId}`,
              kind: 'application_given_part',
              documentInputKey: 'original_question_source',
              value: {
                groupId: group.groupId,
                givenPartId: part.partId,
                role: part.role,
                placement: ['title', 'salutation', 'opening'].includes(part.role)
                  ? 'answer_region_top'
                  : 'answer_region_bottom',
                blockRef: part.blockId,
              },
              span: { start: 0, end: questionPdfBytes.byteLength },
            }))
          : [{
              observationId: `observation:${group.groupId}:answer-region-empty`,
              kind: 'application_answer_region_absence',
              documentInputKey: 'original_question_source',
              value: {
                groupId: group.groupId,
                answerRegionRef: 'writing.application-box',
              },
              span: { start: 0, end: questionPdfBytes.byteLength },
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
          span: { start: 0, end: questionPdfBytes.byteLength },
        },
        {
          observationId: `observation:${group.groupId}:response`,
          kind: 'application_response_binding',
          documentInputKey: 'original_question_source',
          value: {
            groupId: group.groupId,
            writingTaskId: `writing-task:${group.groupId}`,
            answerRegionRef: 'writing.application-box',
          },
          span: { start: 0, end: questionPdfBytes.byteLength },
        },
      )
    }
    sourceGroups.push({
      groupId: group.groupId,
      slotId: slot.slotId,
      family: expectedFamily,
      questionIds,
      blankIds,
      sourceSpanId: sourceFidelity.legacy
        ? sourceSpanId
        : Object.values(sourceSpanRefsByTarget)[0]?.[0] || sourceSpanId,
      content,
      media,
      variant,
      sourceSpanRefsByTarget,
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
      authority: readingOptionFigureAuthorityRef,
      evidence: { documents },
    },
    sourceAsset,
    analysisSidecars,
  }
}
