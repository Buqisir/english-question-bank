import {
  readingOptionFigureAuthorityRef,
  resolveCanonicalAuthority,
  slotsForProfile,
} from '../../shared/paper-canonical/authority.mjs'
import {
  sha256,
  stableStringify,
} from '../../shared/paper-canonical/stable.mjs'

const encoder = new TextEncoder()
const V3 = 'format2-transcription-v3'
const OBJECTIVE_GROUP_TYPES = new Set([
  'seven_choices',
  'cloze',
  'grammar_fill',
])
const NON_WRITING_GROUP_TYPES = new Set([
  'reading',
  ...OBJECTIVE_GROUP_TYPES,
])
const LISTENING_DOCUMENTS = {
  questions: {
    inputKey: 'listening_questions',
    mediaType: 'application/vnd.eqb.listening-questions+json',
    originalName: 'listening-questions.json',
    roles: ['structured_source', 'question_source'],
    schemaVersion: 'paper-listening-questions-v1',
  },
  answers: {
    inputKey: 'listening_answers',
    mediaType: 'application/vnd.eqb.listening-answers+json',
    originalName: 'listening-answers.json',
    roles: ['structured_source', 'official_answer_source'],
    schemaVersion: 'paper-listening-answers-v1',
  },
  transcript: {
    inputKey: 'listening_transcript',
    mediaType: 'application/vnd.eqb.listening-transcript+json',
    originalName: 'listening-transcript.json',
    roles: ['structured_source', 'transcript_source'],
    schemaVersion: 'paper-listening-transcript-v1',
  },
  inventory: {
    inputKey: 'listening_inventory',
    mediaType: 'application/vnd.eqb.listening-source-inventory+json',
    originalName: 'listening-inventory.json',
    roles: ['operator_assertions', 'source_provenance'],
    schemaVersion: 'listening-source-inventory-v1',
  },
}
const EXPECTED_LISTENING_INPUT_KEYS = [
  'original_question_source',
  'listening_answer_source',
  'listening_questions',
  'listening_answers',
  'listening_transcript',
  'listening_inventory',
]

function clone(value) {
  return structuredClone(value)
}

function issue(code, path, message) {
  return { code, path, message }
}

function sameArray(left, right) {
  return Array.isArray(left)
    && left.length === right.length
    && left.every((value, index) => value === right[index])
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function regionObservationId(sourceRegionId) {
  return `observation:format2-source-region:${sourceRegionId}`
}

function regionSpanId(sourceRegionId) {
  return `source-span:${regionObservationId(sourceRegionId)}`
}

function refsAreClosed(refs, sourceRegions, path, issues) {
  if (
    !Array.isArray(refs)
    || refs.length === 0
    || new Set(refs).size !== refs.length
    || refs.some((ref) => !sourceRegions.has(ref))
  ) {
    issues.push(issue(
      'FORMAT2_SOURCE_REGION_REFERENCE_INVALID',
      path,
      'Source-region references must be non-empty, duplicate-free, and resolve exactly',
    ))
    return false
  }
  return true
}

function spanIds(refs) {
  return refs.map(regionSpanId)
}

function assignTarget(targets, key, refs) {
  targets[key] = spanIds(refs)
}

function objectiveBlockNodeId(groupId, blockIndex) {
  return `paragraph:${groupId}:source:${blockIndex + 1}`
}

function objectiveInlineNodeId(groupId, blockIndex, inlineIndex, kind) {
  const prefix = kind === 'text' ? 'text' : 'blank-ref'
  return `${prefix}:${groupId}:source:${blockIndex + 1}:${inlineIndex + 1}`
}

function blockTargetRefs(block, targets) {
  assignTarget(targets, `content_node:${block.blockId}`, block.sourceRegionRefs)
  if (block.kind === 'text') {
    assignTarget(targets, `content_node:text:${block.blockId}`, block.sourceRegionRefs)
  } else if (block.kind === 'table') {
    block.rows.forEach((row, rowIndex) => {
      const rowId = `row:${block.blockId}:${rowIndex + 1}`
      assignTarget(targets, `content_node:${rowId}`, block.sourceRegionRefs)
      row.forEach((_value, columnIndex) => {
        const cellId = `cell:${block.blockId}:${rowIndex + 1}:${columnIndex + 1}`
        assignTarget(targets, `content_node:${cellId}`, block.sourceRegionRefs)
        assignTarget(
          targets,
          `content_node:text:${block.blockId}:${rowIndex + 1}:${columnIndex + 1}`,
          block.sourceRegionRefs,
        )
      })
    })
  } else if (block.kind === 'framed_columns') {
    for (const column of block.columns) {
      if (column.heading) {
        assignTarget(
          targets,
          `content_node:paragraph:${column.columnId}:heading`,
          block.sourceRegionRefs,
        )
        assignTarget(
          targets,
          `content_node:text:paragraph:${column.columnId}:heading`,
          block.sourceRegionRefs,
        )
      }
      column.paragraphs.forEach((_value, index) => {
        const paragraphId = `paragraph:${column.columnId}:${index + 1}`
        assignTarget(targets, `content_node:${paragraphId}`, block.sourceRegionRefs)
        assignTarget(targets, `content_node:text:${paragraphId}`, block.sourceRegionRefs)
      })
    }
  }
}

function orderedObjectiveContent(group) {
  return {
    blocks: group.blocks.map((block, blockIndex) => ({
      kind: 'paragraph',
      nodeId: objectiveBlockNodeId(group.groupId, blockIndex),
      inlines: block.inlines.map((inline, inlineIndex) => inline.kind === 'text'
        ? {
            kind: 'text',
            nodeId: objectiveInlineNodeId(
              group.groupId,
              blockIndex,
              inlineIndex,
              inline.kind,
            ),
            text: inline.text,
          }
        : {
            kind: 'blank_ref',
            nodeId: objectiveInlineNodeId(
              group.groupId,
              blockIndex,
              inlineIndex,
              inline.kind,
            ),
            blankId: `blank:${inline.questionId}`,
          }),
    })),
  }
}

function validateQuestionNumbers(group, slot, groupPath, issues) {
  if (slot?.numberingRule?.kind !== 'range') {
    issues.push(issue(
      'FORMAT2_SOURCE_NUMBERING_INVALID',
      `${groupPath}/slotId`,
      'Every v3 objective group must resolve one ranged profile slot',
    ))
    return
  }
  for (const [questionIndex, question] of group.questions.entries()) {
    const expected = slot.numberingRule.start + questionIndex
    if (question.questionNo !== expected) {
      issues.push(issue(
        'FORMAT2_SOURCE_NUMBERING_INVALID',
        `${groupPath}/questions/${questionIndex}/questionNo`,
        `Canonical Question number must remain profile-derived as ${expected}`,
      ))
    }
  }
}

function decodeListeningEnvelope(envelope, property, paperId, path, issues) {
  const config = LISTENING_DOCUMENTS[property]
  let bytes
  try {
    bytes = Buffer.from(envelope.encodedBytes, 'base64')
  } catch {
    bytes = Buffer.alloc(0)
  }
  let value = null
  if (
    bytes.byteLength === 0
    || bytes.toString('base64') !== envelope.encodedBytes
    || bytes.byteLength !== envelope.byteLength
    || sha256(new Uint8Array(bytes)) !== envelope.sha256
    || envelope.mediaType !== config.mediaType
    || envelope.originalName !== config.originalName
  ) {
    issues.push(issue(
      'FORMAT2_LISTENING_DOCUMENT_IDENTITY_INVALID',
      path,
      `Exact Listening ${property} bytes, digest, length, media type, and name must agree`,
    ))
    return null
  }
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    issues.push(issue(
      'FORMAT2_LISTENING_DOCUMENT_CONTENT_INVALID',
      path,
      `Exact Listening ${property} bytes must be one valid UTF-8 JSON object`,
    ))
    return null
  }
  if (
    !isRecord(value)
    || value.schemaVersion !== config.schemaVersion
    || value.paperId !== paperId
  ) {
    issues.push(issue(
      'FORMAT2_LISTENING_DOCUMENT_CONTENT_INVALID',
      path,
      `Exact Listening ${property} document must bind its role schema and paper identity`,
    ))
    return null
  }
  return {
    inputKey: config.inputKey,
    roles: clone(config.roles),
    mediaType: config.mediaType,
    originalName: config.originalName,
    sha256: envelope.sha256,
    bytes: new Uint8Array(bytes),
    value,
  }
}

function validateListeningContent(documents, transcription, questionDocument, answerDocument, issues) {
  const questions = documents.questions?.value
  const answers = documents.answers?.value
  const transcript = documents.transcript?.value
  const inventory = documents.inventory?.value
  if (!questions || !answers || !transcript || !inventory) return

  const section1 = questions.section1?.questions
  const section2 = questions.section2?.questions
  const expectedQuestionNumbers = Array.from({ length: 20 }, (_value, index) => index + 1)
  const listedQuestions = [
    ...(Array.isArray(section1) ? section1 : []),
    ...(Array.isArray(section2) ? section2 : []),
  ]
  const questionNumbers = listedQuestions.map((question) => question?.no)
  const exactQuestions = (
    Array.isArray(section1)
    && Array.isArray(section2)
    && section1.length === 5
    && section2.length === 15
    && sameArray(questionNumbers, expectedQuestionNumbers)
    && listedQuestions.every((question) => (
      typeof question?.stem === 'string'
      && question.stem.length > 0
      && isRecord(question.options)
      && sameArray(Object.keys(question.options), ['A', 'B', 'C'])
      && Object.values(question.options).every(
        (value) => typeof value === 'string' && value.length > 0,
      )
    ))
  )
  if (!exactQuestions) {
    issues.push(issue(
      'FORMAT2_LISTENING_QUESTION_EVIDENCE_INVALID',
      '/groups/listening/blocks/questions',
      'Listening questions must preserve ordered Questions 1-20 with complete A-C Options',
    ))
  }

  const answerKeys = isRecord(answers.answers) ? Object.keys(answers.answers) : []
  if (
    !sameArray(answerKeys, expectedQuestionNumbers.map(String))
    || expectedQuestionNumbers.some((number) => (
      !['A', 'B', 'C'].includes(answers.answers?.[String(number)])
    ))
  ) {
    issues.push(issue(
      'FORMAT2_LISTENING_ANSWER_EVIDENCE_INVALID',
      '/groups/listening/blocks/answers',
      'Listening answers must bind exactly one admitted A-C Option for Questions 1-20',
    ))
  }

  const expectedTextIds = Array.from({ length: 10 }, (_value, index) => `Text ${index + 1}`)
  const textIds = Array.isArray(transcript.texts)
    ? transcript.texts.map((entry) => entry?.textId)
    : []
  if (
    !sameArray(textIds, expectedTextIds)
    || transcript.texts.some((entry) => (
      !Array.isArray(entry?.lines)
      || entry.lines.length === 0
      || entry.lines.some((line) => typeof line?.line !== 'string' || line.line.length === 0)
    ))
  ) {
    issues.push(issue(
      'FORMAT2_LISTENING_TRANSCRIPT_EVIDENCE_INVALID',
      '/groups/listening/blocks/transcript',
      'Listening transcript must preserve ten ordered non-empty source segments',
    ))
  }

  const shortDialogueJoins = inventory.shortDialogueJoins
  if (
    !Array.isArray(shortDialogueJoins)
    || shortDialogueJoins.length !== 5
    || shortDialogueJoins.some((join, index) => (
      join?.questionNo !== index + 1 || join?.textId !== `Text ${index + 1}`
    ))
  ) {
    issues.push(issue(
      'FORMAT2_LISTENING_TRANSCRIPT_JOIN_INVALID',
      '/groups/listening/blocks/inventory/shortDialogueJoins',
      'Listening short-dialogue joins must cover Questions and Texts 1-5 in source order',
    ))
  }
  const longCoverage = new Map(expectedQuestionNumbers.slice(5).map((number) => [number, 0]))
  for (const entry of transcript.texts || []) {
    for (const questionNo of entry.coversQuestions || []) {
      if (longCoverage.has(questionNo)) {
        longCoverage.set(questionNo, longCoverage.get(questionNo) + 1)
      }
    }
  }
  if ([...longCoverage.values()].some((count) => count !== 1)) {
    issues.push(issue(
      'FORMAT2_LISTENING_TRANSCRIPT_JOIN_INVALID',
      '/groups/listening/blocks/transcript',
      'Listening long-form transcript must cover every Question 6-20 exactly once',
    ))
  }

  const bindings = inventory.sourceBindings
  if (
    inventory.profileId !== 'nck1'
    || inventory.contractRef?.id !== 'listening-raw-closure'
    || inventory.contractRef?.version !== 'nck1-v1'
    || inventory.review?.method !== 'manual_source_transcription'
    || inventory.review?.status !== 'accepted'
    || bindings?.questions?.extractedDocumentDigest !== documents.questions.sha256
    || bindings?.questions?.sourceDocumentDigest !== questionDocument.sha256
    || bindings?.answers?.extractedDocumentDigest !== documents.answers.sha256
    || bindings?.answers?.sourceDocumentDigest !== answerDocument.sha256
    || bindings?.transcript?.extractedDocumentDigest !== documents.transcript.sha256
    || bindings?.transcript?.sourceDocumentDigest !== answerDocument.sha256
    || inventory.receivedArtifactInventory?.status !== 'complete'
    || !sameArray(
      inventory.receivedArtifactInventory?.inputKeys,
      EXPECTED_LISTENING_INPUT_KEYS,
    )
  ) {
    issues.push(issue(
      'FORMAT2_LISTENING_SOURCE_BINDING_INVALID',
      '/groups/listening/blocks/inventory',
      'Listening inventory must close the accepted contract and every immutable source/document binding',
    ))
  }
}

function inspectV3({ transcription, questionDocument, answerDocument }) {
  const issues = []
  const provenance = transcription.provenance
  if (
    provenance.questionSource.sha256 !== transcription.sourceBindings.questionPdfSha256
    || provenance.questionSource.sha256 !== questionDocument.sha256
    || provenance.questionSource.originalName !== questionDocument.originalName
    || new Set(provenance.defaultTags).size !== provenance.defaultTags.length
  ) {
    issues.push(issue(
      'FORMAT2_SOURCE_PROVENANCE_INVALID',
      '/provenance',
      'v3 provenance must bind the exact admitted question source and duplicate-free ordered tags',
    ))
  }

  const sourceRegions = new Map()
  for (const [index, region] of transcription.sourceRegions.entries()) {
    const path = `/sourceRegions/${index}`
    if (
      sourceRegions.has(region.sourceRegionId)
      || region.region.x + region.region.width > 1
      || region.region.y + region.region.height > 1
    ) {
      issues.push(issue(
        'FORMAT2_SOURCE_REGION_INVALID',
        path,
        'Source regions require unique identities and normalized in-page geometry',
      ))
      continue
    }
    sourceRegions.set(region.sourceRegionId, region)
  }

  const authority = resolveCanonicalAuthority(readingOptionFigureAuthorityRef)
  const profile = authority.ok ? authority.closure.profiles.get('nck1') : null
  const slots = profile ? slotsForProfile(profile) : []
  const slotsById = new Map(slots.map((slot) => [slot.slotId, slot]))
  const sourceObservations = [...sourceRegions.values()].map((region) => ({
    observationId: regionObservationId(region.sourceRegionId),
    kind: 'format2_source_region',
    documentInputKey: 'original_question_source',
    value: {
      sourceRegionId: region.sourceRegionId,
      documentRole: region.documentRole,
    },
    span: {
      kind: 'page_region',
      page: region.page,
      region: clone(region.region),
    },
  }))
  const sourceSpanRefsByGroupId = new Map()
  const objectiveGroupsById = new Map()
  const globalContentIds = new Set()
  const perQuestionOptionIds = new Set()
  const sevenChoicesBanks = new Map()

  for (const [groupIndex, group] of transcription.groups.entries()) {
    const groupPath = `/groups/${groupIndex}`
    if (!NON_WRITING_GROUP_TYPES.has(group.groupType)) continue
    refsAreClosed(group.sourceRegionRefs, sourceRegions, `${groupPath}/sourceRegionRefs`, issues)
    const targets = {}
    const slot = slotsById.get(group.slotId)
    validateQuestionNumbers(group, slot, groupPath, issues)

    const objective = OBJECTIVE_GROUP_TYPES.has(group.groupType)
    if (objective && (
      group.blocks.length === 0
      || group.blocks.some((block) => block.kind !== 'objective_paragraph')
    )) {
      issues.push(issue(
        'FORMAT2_ORDERED_COMPOSITION_INVALID',
        `${groupPath}/blocks`,
        'v3 Seven Choices, Cloze, and Grammar Fill require only ordered objective paragraphs',
      ))
    }
    const blankQuestionIds = []
    const inlineById = new Map()
    for (const [blockIndex, block] of group.blocks.entries()) {
      const blockPath = `${groupPath}/blocks/${blockIndex}`
      if (!refsAreClosed(
        block.sourceRegionRefs,
        sourceRegions,
        `${blockPath}/sourceRegionRefs`,
        issues,
      )) continue
      if (globalContentIds.has(block.blockId)) {
        issues.push(issue(
          'FORMAT2_SOURCE_CONTENT_IDENTITY_DUPLICATE',
          `${blockPath}/blockId`,
          'v3 source-content identities must be globally unique',
        ))
      }
      globalContentIds.add(block.blockId)
      if (block.kind !== 'objective_paragraph') {
        blockTargetRefs(block, targets)
        continue
      }
      assignTarget(
        targets,
        `content_node:${objectiveBlockNodeId(group.groupId, blockIndex)}`,
        block.sourceRegionRefs,
      )
      for (const [inlineIndex, inline] of block.inlines.entries()) {
        const inlinePath = `${blockPath}/inlines/${inlineIndex}`
        refsAreClosed(
          inline.sourceRegionRefs,
          sourceRegions,
          `${inlinePath}/sourceRegionRefs`,
          issues,
        )
        if (globalContentIds.has(inline.contentId)) {
          issues.push(issue(
            'FORMAT2_SOURCE_CONTENT_IDENTITY_DUPLICATE',
            `${inlinePath}/contentId`,
            'v3 source-content identities must be globally unique',
          ))
        }
        globalContentIds.add(inline.contentId)
        inlineById.set(inline.contentId, { inline, block, inlineIndex })
        assignTarget(
          targets,
          `content_node:${objectiveInlineNodeId(
            group.groupId,
            blockIndex,
            inlineIndex,
            inline.kind,
          )}`,
          inline.sourceRegionRefs,
        )
        if (inline.kind === 'blank_ref') {
          blankQuestionIds.push(inline.questionId)
          assignTarget(targets, `blank:blank:${inline.questionId}`, inline.sourceRegionRefs)
        }
      }
    }
    if (objective && !sameArray(
      blankQuestionIds,
      group.questions.map((question) => question.questionId),
    )) {
      issues.push(issue(
        'FORMAT2_ORDERED_COMPOSITION_INVALID',
        `${groupPath}/blocks`,
        'Ordered blank references must cover the group Questions exactly once and in source order',
      ))
    }

    let sevenChoicesBank = null
    for (const [questionIndex, question] of group.questions.entries()) {
      const questionPath = `${groupPath}/questions/${questionIndex}`
      refsAreClosed(
        question.sourceRegionRefs,
        sourceRegions,
        `${questionPath}/sourceRegionRefs`,
        issues,
      )
      refsAreClosed(
        question.sourceNumbering.sourceRegionRefs,
        sourceRegions,
        `${questionPath}/sourceNumbering/sourceRegionRefs`,
        issues,
      )
      if (question.sourceNumbering.sourceRegionRefs.length !== 1) {
        issues.push(issue(
          'FORMAT2_SOURCE_NUMBERING_INVALID',
          `${questionPath}/sourceNumbering/sourceRegionRefs`,
          'Each printed ordinal must bind one exact source region',
        ))
      }
      assignTarget(targets, `question:${question.questionId}`, question.sourceRegionRefs)
      assignTarget(
        targets,
        `content_node:text:${question.questionId}:stem`,
        question.sourceRegionRefs,
      )
      sourceObservations.push({
        observationId: `observation:format2-source-numbering:${question.questionId}`,
        kind: 'source_printed_ordinal',
        documentInputKey: 'original_question_source',
        value: {
          questionId: question.questionId,
          slotId: group.slotId,
          printedOrdinal: question.sourceNumbering.printedOrdinal,
          canonicalNumber: question.questionNo,
          interpretation: 'canonical_profile_sequence',
        },
        span: clone(sourceRegions.get(
          question.sourceNumbering.sourceRegionRefs[0],
        ) ? {
            kind: 'page_region',
            page: sourceRegions.get(question.sourceNumbering.sourceRegionRefs[0]).page,
            region: sourceRegions.get(question.sourceNumbering.sourceRegionRefs[0]).region,
          } : { start: 0, end: 1 }),
      })

      const bankEntry = clone(question.options)
      if (group.groupType === 'seven_choices') {
        if (sevenChoicesBank === null) sevenChoicesBank = bankEntry
        else if (stableStringify(bankEntry) !== stableStringify(sevenChoicesBank)) {
          issues.push(issue(
            'FORMAT2_SEVEN_CHOICES_BANK_INVALID',
            `${questionPath}/options`,
            'Every Seven Choices member must reuse the exact ordered supplied A-G bank',
          ))
        }
      }
      for (const [optionIndex, option] of question.options.entries()) {
        if (group.groupType !== 'seven_choices') {
          if (perQuestionOptionIds.has(option.optionId)) {
            issues.push(issue(
              'FORMAT2_OPTION_IDENTITY_DUPLICATE',
              `${questionPath}/options/${optionIndex}/optionId`,
              'Per-question Option identities must be globally unique',
            ))
          }
          perQuestionOptionIds.add(option.optionId)
        }
        if (option.contentKind === 'figure') continue
        refsAreClosed(
          option.sourceRegionRefs,
          sourceRegions,
          `${questionPath}/options/${optionIndex}/sourceRegionRefs`,
          issues,
        )
        assignTarget(targets, `option:${option.optionId}`, option.sourceRegionRefs)
        assignTarget(targets, `content_node:text:${option.optionId}`, option.sourceRegionRefs)
      }

      if (group.groupType === 'grammar_fill') {
        const prompt = question.promptProvision
        if (!prompt || !refsAreClosed(
          prompt.sourceRegionRefs,
          sourceRegions,
          `${questionPath}/promptProvision/sourceRegionRefs`,
          issues,
        )) continue
        assignTarget(
          targets,
          `prompt_provision:blank:${question.questionId}`,
          prompt.sourceRegionRefs,
        )
        if (prompt.provision === 'source_prompt') {
          const resolved = inlineById.get(prompt.sourceContentRef)
          const preceding = resolved?.block?.inlines?.[resolved.inlineIndex - 1]
          if (
            resolved?.inline?.kind !== 'text'
            || preceding?.kind !== 'blank_ref'
            || preceding.questionId !== question.questionId
            || !resolved.inline.text.includes(prompt.prompt)
          ) {
            issues.push(issue(
              'FORMAT2_GRAMMAR_PROMPT_SOURCE_BINDING_INVALID',
              `${questionPath}/promptProvision/sourceContentRef`,
              'A supplied Grammar prompt must resolve to the immediate following source text inline',
            ))
          }
        }
      }
    }
    if (group.groupType === 'seven_choices') {
      const labels = sevenChoicesBank?.map((option) => option.label)
      const optionIds = sevenChoicesBank?.map((option) => option.optionId) || []
      if (
        !sameArray(labels, ['A', 'B', 'C', 'D', 'E', 'F', 'G'])
        || new Set(optionIds).size !== 7
      ) {
        issues.push(issue(
          'FORMAT2_SEVEN_CHOICES_BANK_INVALID',
          `${groupPath}/questions`,
          'Seven Choices requires one exact supplied A-G bank',
        ))
      }
      sevenChoicesBanks.set(group.groupId, sevenChoicesBank || [])
    }
    sourceSpanRefsByGroupId.set(group.groupId, targets)
    if (objective) {
      objectiveGroupsById.set(group.groupId, orderedObjectiveContent(group))
    }
  }

  const listeningDocuments = []
  if (transcription.listeningSource.disposition === 'complete') {
    const listeningGroups = transcription.groups.filter(
      (group) => group.groupType === 'listening',
    )
    const block = listeningGroups[0]?.blocks.find(
      (candidate) => candidate.kind === 'listening_material',
    )
    if (
      listeningGroups.length !== 1
      || listeningGroups[0].groupId !== transcription.listeningSource.groupId
      || !block
    ) {
      issues.push(issue(
        'FORMAT2_LISTENING_SOURCE_CLOSURE_INVALID',
        '/listeningSource',
        'Complete v3 Listening source must bind exactly one exact-document group',
      ))
    } else {
      const decoded = Object.fromEntries(Object.keys(LISTENING_DOCUMENTS).map(
        (property) => [property, decodeListeningEnvelope(
          block[property],
          property,
          transcription.paperId,
          `/groups/listening/blocks/${property}`,
          issues,
        )],
      ))
      validateListeningContent(
        decoded,
        transcription,
        questionDocument,
        answerDocument,
        issues,
      )
      listeningDocuments.push(...Object.values(decoded).filter(Boolean).map((document) => ({
        inputKey: document.inputKey,
        roles: document.roles,
        mediaType: document.mediaType,
        originalName: document.originalName,
        bytes: document.bytes,
      })))
    }
  }

  const provenanceBytes = encoder.encode(`${stableStringify(provenance)}\n`)
  const provenanceDocument = {
    inputKey: 'format2_paper_provenance',
    roles: ['source_provenance'],
    mediaType: 'application/vnd.eqb.format2-paper-provenance+json',
    originalName: 'format2-paper-provenance.json',
    bytes: provenanceBytes,
  }
  sourceObservations.push({
    observationId: 'observation:format2-paper-provenance',
    kind: 'format2_paper_provenance',
    documentInputKey: provenanceDocument.inputKey,
    value: { paperId: transcription.paperId, schemaVersion: provenance.schemaVersion },
    span: { start: 0, end: provenanceBytes.byteLength },
  })

  return {
    ok: issues.length === 0,
    issues,
    model: {
      legacy: false,
      provenanceDocument,
      supplementalDocuments: [...listeningDocuments],
      sourceObservations,
      objectiveGroupsById,
      sourceSpanRefsByGroupId,
      sevenChoicesBanks,
      sourceCropReproducibilityByObservationId: new Map(
        transcription.visuals.flatMap((visual) => (
          visual.sourceCropReproducibility
            ? [[visual.observationId, clone(visual.sourceCropReproducibility)]]
            : []
        )),
      ),
    },
  }
}

/**
 * Normalizes the v3 source-faithful contract for both the public Job and the
 * trusted Canonical adapter. Older transcription versions deliberately return
 * a legacy marker so their request bytes and derived identities do not change.
 */
export function inspectFormat2SourceFidelity({
  transcription,
  questionDocument,
  answerDocument,
}) {
  if (transcription?.schemaVersion !== V3) {
    return { ok: true, issues: [], model: { legacy: true } }
  }
  return inspectV3({ transcription, questionDocument, answerDocument })
}
