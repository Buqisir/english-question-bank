import {
  digestJson,
  exactKeys,
  isRecordValue,
  stableStringify,
} from './stable.mjs'
import { validateJsonSchema } from './authority.mjs'

const slotSpecs = Object.freeze([
  Object.freeze({
    slotId: 'listening.short-dialogue',
    questionNumbers: Object.freeze([1, 2, 3, 4, 5]),
    textIds: Object.freeze(['Text 1', 'Text 2', 'Text 3', 'Text 4', 'Text 5']),
  }),
  Object.freeze({
    slotId: 'listening.long-form',
    questionNumbers: Object.freeze([
      6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    ]),
    textIds: Object.freeze(['Text 6', 'Text 7', 'Text 8', 'Text 9', 'Text 10']),
  }),
])

function diagnostic(code, disposition, path, message, sourceSpanRefs = []) {
  return { code, disposition, path, message, sourceSpanRefs }
}

function sameMembers(actual, expected) {
  return (
    actual.length === expected.length
    && new Set(actual).size === actual.length
    && expected.every((value) => actual.includes(value))
  )
}

function sourceDocumentForDigest(documents, digest) {
  return documents.find((document) => document.sha256 === digest)
}

function stableId(prefix, value) {
  return `${prefix}:${digestJson(value).slice('sha256:'.length, 28)}`
}

function createClosureLedger(source) {
  let sequence = Math.max(
    0,
    ...(source.transformations || []).map((record) => record.sequence || 0),
  )
  source.transformations = [...(source.transformations || [])]

  function observe({
    document,
    adapterId,
    kind,
    observationId,
    target,
    value,
  }) {
    const sourceSpanId = `source-span:${observationId}`
    const recordId = `record:${observationId}`
    const sourceValueDigest = digestJson(value)
    const record = {
      recordId,
      sequence: ++sequence,
      ruleId: 'direct-projection',
      ruleVersion: '2',
      target: {
        identity: target.id,
        path: `${target.kind}:${target.id}`,
      },
      operation: 'direct_projection',
      inputSourceSpanIds: [sourceSpanId],
      before: value,
      after: value,
      certainty: 'exact',
      preconditions: {
        sourceObservationIds: [observationId],
        sourceValueDigests: [sourceValueDigest],
      },
      outputDigest: sourceValueDigest,
    }
    source.transformations.push(record)
    source.observations.push({
      observationId,
      kind,
      documentInputKey: document.inputKey,
      value,
      extraction: { adapterId, version: '1' },
      span: { start: 0, end: document.byteLength },
    })
    return {
      observationId,
      sourceSpanId,
      recordId,
      value,
      sourceMapEntry: {
        target,
        sourceSpanRefs: [sourceSpanId],
        transformationRecordIds: [recordId],
      },
    }
  }

  function join({ left, right, target }) {
    const sourceObservationIds = [left.observationId, right.observationId]
    const sourceValueDigests = [
      digestJson(left.value),
      digestJson(right.value),
    ]
    const joined = { sourceObservationIds, sourceValueDigests }
    const recordId =
      `record:listening:join:${target.kind}:${target.id}`
    source.transformations.push({
      recordId,
      sequence: ++sequence,
      ruleId: 'direct-projection',
      ruleVersion: '2',
      target: {
        identity: stableId('source-join', joined),
        path: 'source_join',
      },
      operation: 'exact_join',
      inputSourceSpanIds: [left.sourceSpanId, right.sourceSpanId],
      before: joined,
      after: joined,
      certainty: 'exact',
      preconditions: { sourceObservationIds, sourceValueDigests },
      outputDigest: digestJson(joined),
    })
    return {
      recordId,
      sourceMapEntry: {
        target,
        sourceSpanRefs: [left.sourceSpanId, right.sourceSpanId],
        transformationRecordIds: [recordId],
      },
    }
  }

  return { join, observe }
}

function rejectForbiddenActiveFields(value, diagnostics) {
  const queue = [{ path: '$.evidence.listening', value }]
  while (queue.length > 0) {
    const current = queue.shift()
    if (Array.isArray(current.value)) {
      current.value.forEach((item, index) => queue.push({
        path: `${current.path}[${index}]`,
        value: item,
      }))
      continue
    }
    if (!isRecordValue(current.value)) continue
    for (const [key, nested] of Object.entries(current.value)) {
      const path = `${current.path}.${key}`
      if (/audio|playback|groupref|activegroup/i.test(key)) {
        diagnostics.push(diagnostic(
          'LISTENING_ACTIVE_OR_AUDIO_REFERENCE_UNSUPPORTED',
          'unsupported',
          path,
          'Inactive listening evidence cannot carry active Group, playback, or unclosed audio references',
        ))
      } else {
        queue.push({ path, value: nested })
      }
    }
  }
}

function validateProfileContract(profileSlots, diagnostics) {
  const slotsById = new Map(profileSlots.map((slot) => [slot.slotId, slot]))
  for (const spec of slotSpecs) {
    const slot = slotsById.get(spec.slotId)
    const expectedQuestionCount = spec.questionNumbers.length
    if (
      !slot
      || slot.activation !== 'inactive_source'
      || slot.renderPolicy !== 'suppress'
      || !isRecordValue(slot.sourceClosureContractRef)
      || !exactKeys(slot.sourceClosureContractRef, ['id', 'version'])
      || slot.sourceClosureContractRef.id !== 'listening-raw-closure'
      || slot.sourceClosureContractRef.version !== 'nck1-v1'
      || !isRecordValue(slot.questionRule)
      || !exactKeys(slot.questionRule, ['numbering', 'cardinality', 'optionLabels'])
      || slot.questionRule.numbering?.start !== spec.questionNumbers[0]
      || slot.questionRule.numbering?.end !== spec.questionNumbers.at(-1)
      || slot.questionRule.cardinality !== expectedQuestionCount
      || !Array.isArray(slot.questionRule.optionLabels)
      || slot.questionRule.optionLabels.join('') !== 'ABC'
      || slot.officialAnswerRule?.exactlyOnePerQuestion !== true
      || slot.officialAnswerRule?.labelMustBelongToQuestionOptions !== true
      || slot.transcriptRule?.segmentCardinality !== 5
      || slot.transcriptRule?.everyQuestionCoveredExactlyOnce !== true
      || slot.supplementalEvidenceRule?.timing !== 'preserve_exactly_if_supplied'
      || slot.supplementalEvidenceRule?.audio !== 'not_required_for_inactive_closure'
    ) {
      diagnostics.push(diagnostic(
        'LISTENING_PROFILE_CONTRACT_INVALID',
        'unsupported',
        `$.profile.slots.${spec.slotId}`,
        `Inactive listening slot ${spec.slotId} does not bind listening-raw-closure@nck1-v1`,
      ))
    }
  }
  return slotsById
}

function validateInventory({
  inventory,
  inventorySchema,
  inventoryDocument,
  documents,
  questionDocument,
  answerDocument,
  transcriptDocument,
  source,
  diagnostics,
}) {
  const schemaIssues = inventorySchema
    ? validateJsonSchema(
        inventory,
        inventorySchema,
        '$.evidence.listeningInventory',
      )
    : [{ message: 'Listening inventory schema is unavailable' }]
  if (schemaIssues.length > 0) {
    diagnostics.push(...schemaIssues.map((item) => diagnostic(
      'LISTENING_INVENTORY_INVALID',
      'incomplete_source',
      item.path || '$.evidence.listeningInventory',
      item.message,
    )))
    return null
  }
  const expectedKeys = [
    'original_question_source',
    'listening_answer_source',
    'listening_questions',
    'listening_answers',
    'listening_transcript',
    'listening_inventory',
    ...(inventory?.audio?.disposition === 'captured_uninterpreted'
      && typeof inventory.audio.inputKey === 'string'
      ? [inventory.audio.inputKey]
      : []),
  ]
  if (
    !isRecordValue(inventory)
    || !exactKeys(inventory, [
      'schemaVersion',
      'paperId',
      'profileId',
      'contractRef',
      'review',
      'sourceBindings',
      'shortDialogueJoins',
      'timing',
      'audio',
      'receivedArtifactInventory',
    ])
    || inventory.schemaVersion !== 'listening-source-inventory-v1'
    || inventory.paperId !== source.paperId
    || inventory.profileId !== source.profileId
    || !exactKeys(inventory.contractRef, ['id', 'version'])
    || inventory.contractRef.id !== 'listening-raw-closure'
    || inventory.contractRef.version !== 'nck1-v1'
    || !exactKeys(inventory.review, ['method', 'status'])
    || inventory.review.method !== 'manual_source_transcription'
    || inventory.review.status !== 'accepted'
  ) {
    diagnostics.push(diagnostic(
      'LISTENING_INVENTORY_INVALID',
      'incomplete_source',
      '$.evidence.listeningInventory',
      'Listening source inventory must be one accepted, closed nck1-v1 evidence declaration',
    ))
    return null
  }
  const bindings = inventory.sourceBindings
  const bindingPairs = [
    {
      key: 'questions',
      document: questionDocument,
      mediaType: 'application/vnd.eqb.listening-questions+json',
      extractedRoles: ['structured_source', 'question_source'],
      sourceRoles: ['question_source', 'source_provenance'],
    },
    {
      key: 'answers',
      document: answerDocument,
      mediaType: 'application/vnd.eqb.listening-answers+json',
      extractedRoles: ['structured_source', 'official_answer_source'],
      sourceRoles: ['official_answer_source', 'source_provenance'],
    },
    {
      key: 'transcript',
      document: transcriptDocument,
      mediaType: 'application/vnd.eqb.listening-transcript+json',
      extractedRoles: ['structured_source', 'transcript_source'],
      sourceRoles: ['transcript_source', 'source_provenance'],
    },
  ]
  for (const {
    key,
    document,
    mediaType,
    extractedRoles,
    sourceRoles,
  } of bindingPairs) {
    const binding = bindings?.[key]
    const matchingSourceDocuments = isRecordValue(binding)
      ? documents.filter((candidate) =>
          candidate.sha256 === binding.sourceDocumentDigest
          && sourceRoles.every((role) => candidate.roles.includes(role)))
      : []
    if (
      !isRecordValue(binding)
      || !exactKeys(binding, ['extractedDocumentDigest', 'sourceDocumentDigest'])
      || binding.extractedDocumentDigest !== document.sha256
      || document.mediaType !== mediaType
      || !extractedRoles.every((role) => document.roles.includes(role))
      || matchingSourceDocuments.length !== 1
    ) {
      diagnostics.push(diagnostic(
        'LISTENING_SOURCE_BINDING_INVALID',
        'incomplete_source',
        `$.evidence.listeningInventory.sourceBindings.${key}`,
        `Listening ${key} evidence does not bind immutable extracted and source documents`,
      ))
    }
  }
  const inventoryClosure = inventory.receivedArtifactInventory
  const receivedInputKeys = Array.isArray(inventoryClosure?.inputKeys)
    ? inventoryClosure.inputKeys
    : []
  const listeningEvidenceMediaTypes = new Set([
    'application/vnd.eqb.listening-questions+json',
    'application/vnd.eqb.listening-answers+json',
    'application/vnd.eqb.listening-transcript+json',
    'application/vnd.eqb.listening-source-inventory+json',
  ])
  const unlistedListeningDocuments = documents.filter((document) =>
    (
      listeningEvidenceMediaTypes.has(document.mediaType)
      || document.roles.includes('audio_source')
    )
    && !receivedInputKeys.includes(document.inputKey))
  if (
    !isRecordValue(inventoryClosure)
    || !exactKeys(inventoryClosure, ['status', 'inputKeys'])
    || inventoryClosure.status !== 'complete'
    || !Array.isArray(inventoryClosure.inputKeys)
    || !sameMembers(inventoryClosure.inputKeys, expectedKeys)
    || expectedKeys.some((inputKey) => !documents.some((document) => document.inputKey === inputKey))
    || unlistedListeningDocuments.length > 0
    || inventoryDocument.inputKey !== 'listening_inventory'
  ) {
    diagnostics.push(diagnostic(
      'LISTENING_ARTIFACT_INVENTORY_OPEN',
      'incomplete_source',
      '$.evidence.listeningInventory.receivedArtifactInventory',
      'Listening inactive closure requires one complete received-artifact inventory',
    ))
  }
  const audioDocuments = documents.filter((document) =>
    document.roles.includes('audio_source'))
  if (
    inventory.audio?.disposition === 'not_supplied'
    && (
      !exactKeys(inventory.audio, ['disposition', 'sourceReferences'])
      || !Array.isArray(inventory.audio.sourceReferences)
      || inventory.audio.sourceReferences.length !== 0
      || audioDocuments.length !== 0
    )
  ) {
    diagnostics.push(diagnostic(
      'LISTENING_AUDIO_EVIDENCE_INCOMPLETE',
      'incomplete_source',
      '$.evidence.listeningInventory.audio',
      'Audio absence requires a closed inventory, no source reference, and no received audio artifact',
    ))
  } else if (inventory.audio?.disposition === 'captured_uninterpreted') {
    if (
      !exactKeys(inventory.audio, ['disposition', 'inputKey', 'mediaType', 'sha256'])
      || audioDocuments.length !== 1
      || audioDocuments[0].inputKey !== inventory.audio.inputKey
      || audioDocuments[0].mediaType !== inventory.audio.mediaType
      || audioDocuments[0].sha256 !== inventory.audio.sha256
    ) {
      diagnostics.push(diagnostic(
        'LISTENING_AUDIO_EVIDENCE_INCOMPLETE',
        'incomplete_source',
        '$.evidence.listeningInventory.audio',
        'Referenced audio must close opaque bytes, media type, length, and digest',
      ))
    }
  } else if (inventory.audio?.disposition !== 'not_supplied') {
    diagnostics.push(diagnostic(
      'LISTENING_AUDIO_EVIDENCE_INCOMPLETE',
      'incomplete_source',
      '$.evidence.listeningInventory.audio',
      'Listening audio disposition is not closed',
    ))
  }
  return {
    audio: inventory.audio.disposition === 'captured_uninterpreted'
      ? {
          disposition: 'captured_uninterpreted',
          artifactRef: audioDocuments[0]?.immutableArtifactRef?.artifactId,
          digest: audioDocuments[0]?.sha256,
        }
      : { disposition: 'not_supplied' },
  }
}

function validateQuestions(questions, source, diagnostics) {
  if (
    questions?.schemaVersion !== 'paper-listening-questions-v1'
    || questions.paperId !== source.paperId
    || !isRecordValue(questions.section1)
    || !isRecordValue(questions.section2)
    || !Array.isArray(questions.section1.questions)
    || !Array.isArray(questions.section2.questions)
  ) {
    diagnostics.push(diagnostic(
      'LISTENING_QUESTION_EVIDENCE_INCOMPLETE',
      'incomplete_source',
      '$.evidence.listeningQuestions',
      'Listening questions must close both NCK1 source sections',
    ))
    return null
  }
  const bySlot = new Map([
    ['listening.short-dialogue', questions.section1.questions],
    ['listening.long-form', questions.section2.questions],
  ])
  for (const spec of slotSpecs) {
    const slotQuestions = bySlot.get(spec.slotId)
    const numbers = slotQuestions.map((question) => question?.no)
    if (!sameMembers(numbers, spec.questionNumbers)) {
      diagnostics.push(diagnostic(
        'LISTENING_QUESTION_SHAPE_UNSUPPORTED',
        slotQuestions.length < spec.questionNumbers.length
          ? 'incomplete_source'
          : 'unsupported',
        `$.evidence.listeningQuestions.${spec.slotId}`,
        `Listening slot ${spec.slotId} must contain exactly questions ${spec.questionNumbers[0]}-${spec.questionNumbers.at(-1)}`,
      ))
      continue
    }
    if (stableStringify(numbers) !== stableStringify(spec.questionNumbers)) {
      diagnostics.push(diagnostic(
        'LISTENING_QUESTION_ORDER_AMBIGUOUS',
        'needs_review',
        `$.evidence.listeningQuestions.${spec.slotId}`,
        `Listening slot ${spec.slotId} must preserve source Question order`,
      ))
    }
    for (const question of slotQuestions) {
      const labels = isRecordValue(question?.options)
        ? Object.keys(question.options)
        : []
      if (
        typeof question?.stem !== 'string'
        || question.stem.length === 0
        || !isRecordValue(question.options)
        || labels.some((label) => typeof question.options[label] !== 'string' || question.options[label].length === 0)
      ) {
        diagnostics.push(diagnostic(
          'LISTENING_QUESTION_EVIDENCE_INCOMPLETE',
          'incomplete_source',
          `$.evidence.listeningQuestions.questions.${question?.no}`,
          `Listening Question ${question?.no ?? 'unknown'} lacks a stem or complete Option values`,
        ))
      } else if (labels.length < 3) {
        diagnostics.push(diagnostic(
          'LISTENING_QUESTION_EVIDENCE_INCOMPLETE',
          'incomplete_source',
          `$.evidence.listeningQuestions.questions.${question.no}.options`,
          'NCK1 inactive listening requires every source A-C Option',
        ))
      } else if (!sameMembers(labels, ['A', 'B', 'C'])) {
        diagnostics.push(diagnostic(
          'LISTENING_OPTION_SHAPE_UNSUPPORTED',
          'unsupported',
          `$.evidence.listeningQuestions.questions.${question.no}.options`,
          'NCK1 inactive listening requires the exact A-C Option shape',
        ))
      }
    }
  }
  return bySlot
}

function validateAnswers(answers, questionsBySlot, source, diagnostics) {
  if (
    answers?.schemaVersion !== 'paper-listening-answers-v1'
    || answers.paperId !== source.paperId
    || !isRecordValue(answers.answers)
  ) {
    diagnostics.push(diagnostic(
      'LISTENING_ANSWER_EVIDENCE_INCOMPLETE',
      'incomplete_source',
      '$.evidence.listeningAnswers',
      'Listening official answers must bind the same paper',
    ))
    return null
  }
  const expectedNumbers = slotSpecs.flatMap((spec) => spec.questionNumbers)
  const answerNumbers = Object.keys(answers.answers).map(Number)
  if (!sameMembers(answerNumbers, expectedNumbers)) {
    diagnostics.push(diagnostic(
      'LISTENING_ANSWER_EVIDENCE_INCOMPLETE',
      answerNumbers.length < expectedNumbers.length
        ? 'incomplete_source'
        : 'answer_conflict',
      '$.evidence.listeningAnswers.answers',
      'Listening requires exactly one official answer for every Question 1-20',
    ))
  }
  const questions = [...(questionsBySlot?.values() || [])].flat()
  for (const question of questions) {
    const answer = answers.answers[String(question.no)]
    if (typeof answer !== 'string') continue
    if (!Object.hasOwn(question.options || {}, answer)) {
      diagnostics.push(diagnostic(
        'LISTENING_OFFICIAL_ANSWER_CONFLICT',
        'answer_conflict',
        `$.evidence.listeningAnswers.answers.${question.no}`,
        `Official answer ${answer} does not join one source Option for Question ${question.no}`,
      ))
    }
  }
  return answers.answers
}

function validateTranscript({
  transcript,
  questionsBySlot,
  inventory,
  source,
  diagnostics,
}) {
  if (
    transcript?.schemaVersion !== 'paper-listening-transcript-v1'
    || transcript.paperId !== source.paperId
    || !Array.isArray(transcript.texts)
  ) {
    diagnostics.push(diagnostic(
      'LISTENING_TRANSCRIPT_EVIDENCE_INCOMPLETE',
      'incomplete_source',
      '$.evidence.listeningTranscript',
      'Listening transcript must bind ten ordered source segments',
    ))
    return null
  }
  const textIds = transcript.texts.map((text) => text?.textId)
  const expectedTextIds = slotSpecs.flatMap((spec) => spec.textIds)
  if (!sameMembers(textIds, expectedTextIds)) {
    diagnostics.push(diagnostic(
      'LISTENING_TRANSCRIPT_SHAPE_UNSUPPORTED',
      transcript.texts.length < expectedTextIds.length
        ? 'incomplete_source'
        : 'unsupported',
      '$.evidence.listeningTranscript.texts',
      'NCK1 inactive listening requires exactly ten transcript segments',
    ))
  } else if (stableStringify(textIds) !== stableStringify(expectedTextIds)) {
    diagnostics.push(diagnostic(
      'LISTENING_TRANSCRIPT_ORDER_AMBIGUOUS',
      'needs_review',
      '$.evidence.listeningTranscript.texts',
      'Listening transcript segments must preserve source order',
    ))
  }
  for (const text of transcript.texts) {
    if (
      typeof text?.textId !== 'string'
      || !Array.isArray(text.lines)
      || text.lines.length === 0
      || text.lines.some((line) => typeof line?.line !== 'string' || line.line.length === 0)
    ) {
      diagnostics.push(diagnostic(
        'LISTENING_TRANSCRIPT_EVIDENCE_INCOMPLETE',
        'incomplete_source',
        '$.evidence.listeningTranscript.texts',
        'Every listening transcript segment requires non-empty source content',
      ))
    }
  }
  const shortJoins = inventory.shortDialogueJoins
  if (
    !Array.isArray(shortJoins)
    || shortJoins.length !== 5
    || new Set(shortJoins.map((join) => join?.questionNo)).size !== 5
    || new Set(shortJoins.map((join) => join?.textId)).size !== 5
    || shortJoins.some((join, index) =>
      !slotSpecs[0].questionNumbers.includes(join?.questionNo)
      || !slotSpecs[0].textIds.includes(join?.textId)
      || join.questionNo !== slotSpecs[0].questionNumbers[index]
      || join.textId !== slotSpecs[0].textIds[index])
  ) {
    diagnostics.push(diagnostic(
      'LISTENING_TRANSCRIPT_JOIN_AMBIGUOUS',
      'needs_review',
      '$.evidence.listeningInventory.shortDialogueJoins',
      'Short-dialogue source-order joins must cover Questions 1-5 and Texts 1-5 exactly once',
    ))
  }
  const longQuestions = questionsBySlot?.get('listening.long-form') || []
  const coverage = new Map(slotSpecs[1].questionNumbers.map((number) => [number, []]))
  for (const text of transcript.texts.filter((candidate) =>
    slotSpecs[1].textIds.includes(candidate?.textId))) {
    if (!Array.isArray(text.coversQuestions)) {
      diagnostics.push(diagnostic(
        'LISTENING_TRANSCRIPT_COVERAGE_INCOMPLETE',
        'incomplete_source',
        `$.evidence.listeningTranscript.texts.${text.textId}`,
        'Long-form transcript segments require explicit Question coverage',
      ))
      continue
    }
    const expectedCoverage = longQuestions
      .filter((question) => question.textRef === text.textId)
      .map((question) => question.no)
    if (stableStringify(text.coversQuestions) !== stableStringify(expectedCoverage)) {
      diagnostics.push(diagnostic(
        'LISTENING_TRANSCRIPT_JOIN_AMBIGUOUS',
        'needs_review',
        `$.evidence.listeningTranscript.texts.${text.textId}.coversQuestions`,
        'Long-form transcript joins must preserve source Question order',
      ))
    }
    for (const questionNo of text.coversQuestions) {
      if (coverage.has(questionNo)) coverage.get(questionNo).push(text.textId)
      else {
        diagnostics.push(diagnostic(
          'LISTENING_TRANSCRIPT_JOIN_AMBIGUOUS',
          'needs_review',
          `$.evidence.listeningTranscript.texts.${text.textId}.coversQuestions`,
          'Transcript coverage escapes the NCK1 long-form Question range',
        ))
      }
    }
  }
  for (const question of longQuestions) {
    const joinedTextIds = coverage.get(question.no) || []
    if (joinedTextIds.length === 0) {
      diagnostics.push(diagnostic(
        'LISTENING_TRANSCRIPT_COVERAGE_INCOMPLETE',
        'incomplete_source',
        `$.evidence.listeningTranscript.questions.${question.no}`,
        `Question ${question.no} is not covered by one transcript segment`,
      ))
    } else if (
      joinedTextIds.length !== 1
      || question.textRef !== joinedTextIds[0]
    ) {
      diagnostics.push(diagnostic(
        'LISTENING_TRANSCRIPT_JOIN_AMBIGUOUS',
        'needs_review',
        `$.evidence.listeningTranscript.questions.${question.no}`,
        `Question ${question.no} has an ambiguous transcript join`,
      ))
    }
  }
  const timingDisposition = inventory.timing?.disposition
  if (timingDisposition === 'supplied') {
    if (!Array.isArray(transcript.timingTable)) {
      diagnostics.push(diagnostic(
        'LISTENING_TIMING_EVIDENCE_INCOMPLETE',
        'incomplete_source',
        '$.evidence.listeningTranscript.timingTable',
        'Declared supplied timing is missing',
      ))
    } else {
      const timingIds = transcript.timingTable.map((row) => row?.text)
      if (!sameMembers(timingIds, expectedTextIds)) {
        diagnostics.push(diagnostic(
          'LISTENING_TIMING_EVIDENCE_INCOMPLETE',
          'incomplete_source',
          '$.evidence.listeningTranscript.timingTable',
          'Supplied timing must cover every transcript segment exactly once',
        ))
      } else if (
        stableStringify(timingIds) !== stableStringify(expectedTextIds)
      ) {
        diagnostics.push(diagnostic(
          'LISTENING_TIMING_ORDER_AMBIGUOUS',
          'needs_review',
          '$.evidence.listeningTranscript.timingTable',
          'Listening timing rows must preserve transcript source order',
        ))
      }
      for (const row of transcript.timingTable) {
        const text = transcript.texts.find((candidate) => candidate.textId === row?.text)
        if (
          !text
          || row.time !== text.timeRange
          || !Number.isInteger(row.durationSeconds)
          || !Number.isInteger(row.wordCount)
          || !Number.isInteger(row.wordsPerMinute)
        ) {
          diagnostics.push(diagnostic(
            'LISTENING_TIMING_EVIDENCE_INCOMPLETE',
            'incomplete_source',
            '$.evidence.listeningTranscript.timingTable',
            'Timing rows must preserve literal segment identity, range, duration, word count, and rate',
          ))
        }
      }
    }
  } else if (
    timingDisposition !== 'not_supplied'
    || Object.hasOwn(transcript, 'timingTable')
    || transcript.texts.some((text) => Object.hasOwn(text, 'timeRange'))
  ) {
    diagnostics.push(diagnostic(
      'LISTENING_TIMING_EVIDENCE_INCOMPLETE',
      'incomplete_source',
      '$.evidence.listeningInventory.timing',
      'Timing absence is valid only when the closed transcript source supplies no timing fields',
    ))
  }
  return {
    timing: timingDisposition === 'supplied'
      ? { disposition: 'supplied', rowCount: 5 }
      : { disposition: 'not_supplied' },
  }
}

export function appendListeningInactiveClosures({
  source,
  profileSlots,
  documents,
  questionsEntry,
  answersEntry,
  transcriptEntry,
  inventoryEntry,
  inventorySchema,
  diagnostics,
}) {
  const entries = [questionsEntry, answersEntry, transcriptEntry, inventoryEntry]
  if (entries.every((entry) => !entry)) return
  if (entries.some((entry) => !entry)) {
    diagnostics.push(diagnostic(
      'LISTENING_EVIDENCE_INCOMPLETE',
      'incomplete_source',
      '$.evidence.documents',
      'Listening inactive closure requires questions, answers, transcript, and inventory evidence together',
    ))
    return
  }
  if (source.profileId !== 'nck1') {
    diagnostics.push(diagnostic(
      'LISTENING_PROFILE_UNSUPPORTED',
      'unsupported',
      '$.profileId',
      'The listening-raw-closure@nck1-v1 contract is only valid for NCK1',
    ))
    return
  }
  rejectForbiddenActiveFields(questionsEntry.value, diagnostics)
  rejectForbiddenActiveFields(transcriptEntry.value, diagnostics)
  validateProfileContract(profileSlots, diagnostics)
  const inventoryResult = validateInventory({
    inventory: inventoryEntry.value,
    inventorySchema,
    inventoryDocument: inventoryEntry.document,
    documents,
    questionDocument: questionsEntry.document,
    answerDocument: answersEntry.document,
    transcriptDocument: transcriptEntry.document,
    source,
    diagnostics,
  })
  const questionsBySlot = validateQuestions(
    questionsEntry.value,
    source,
    diagnostics,
  )
  const answers = validateAnswers(
    answersEntry.value,
    questionsBySlot,
    source,
    diagnostics,
  )
  const transcriptResult = validateTranscript({
    transcript: transcriptEntry.value,
    questionsBySlot,
    inventory: inventoryEntry.value,
    source,
    diagnostics,
  })
  if (
    !inventoryResult
    || !questionsBySlot
    || !answers
    || !transcriptResult
    || diagnostics.some((item) => item.disposition !== 'ready')
  ) return

  source.inactiveSlots = { ...(source.inactiveSlots || {}) }
  source.inactiveSourceClosures = []
  const ledger = createClosureLedger(source)
  const sourceBindings = inventoryEntry.value.sourceBindings
  const questionSourceDocument = sourceDocumentForDigest(
    documents,
    sourceBindings.questions.sourceDocumentDigest,
  )
  const answerSourceDocument = sourceDocumentForDigest(
    documents,
    sourceBindings.answers.sourceDocumentDigest,
  )
  const questionsByNumber = new Map(
    [...questionsBySlot.values()]
      .flat()
      .map((question) => [question.no, question]),
  )
  const transcriptById = new Map(
    transcriptEntry.value.texts.map((text) => [text.textId, text]),
  )
  const timingByTextId = new Map(
    (transcriptEntry.value.timingTable || [])
      .map((row) => [row.text, row]),
  )
  const shortTextByQuestion = new Map(
    inventoryEntry.value.shortDialogueJoins
      .map((join) => [join.questionNo, join.textId]),
  )
  for (const spec of slotSpecs) {
    const suffix = spec.slotId.replaceAll('.', ':')
    const sourceMapEntries = []
    const questionObservations = new Map()
    const optionObservations = new Map()
    const answerObservations = new Map()
    const transcriptObservations = new Map()
    const addObservation = (input) => {
      const observed = ledger.observe(input)
      sourceMapEntries.push(observed.sourceMapEntry)
      return observed
    }
    addObservation({
      document: inventoryEntry.document,
      adapterId: 'listening-source-inventory',
      kind: 'listening_inventory_closure',
      observationId: `observation:${suffix}:inventory`,
      target: { kind: 'inactive_inventory', id: `inventory:${spec.slotId}` },
      value: {
        slotId: spec.slotId,
        contractRef: inventoryEntry.value.contractRef,
        sourceBindings: inventoryEntry.value.sourceBindings,
        timing: inventoryEntry.value.timing,
        audio: inventoryEntry.value.audio,
      },
    })
    addObservation({
      document: questionSourceDocument,
      adapterId: 'listening-source-inventory',
      kind: 'listening_question_source',
      observationId: `observation:${suffix}:question-source`,
      target: {
        kind: 'inactive_source_document',
        id: `source-document:${spec.slotId}:questions`,
      },
      value: {
        slotId: spec.slotId,
        documentDigest: questionSourceDocument.sha256,
      },
    })
    addObservation({
      document: answerSourceDocument,
      adapterId: 'listening-source-inventory',
      kind: 'listening_answer_transcript_source',
      observationId: `observation:${suffix}:answer-source`,
      target: {
        kind: 'inactive_source_document',
        id: `source-document:${spec.slotId}:answers-transcript`,
      },
      value: {
        slotId: spec.slotId,
        documentDigest: answerSourceDocument.sha256,
      },
    })
    for (const questionNo of spec.questionNumbers) {
      const question = questionsByNumber.get(questionNo)
      const questionObservation = addObservation({
        document: questionsEntry.document,
        adapterId: 'listening-questions-source',
        kind: 'listening_question',
        observationId: `observation:${suffix}:question:${questionNo}`,
        target: {
          kind: 'inactive_question',
          id: `question:listening:${questionNo}`,
        },
        value: {
          questionNo,
          stem: question.stem,
        },
      })
      questionObservations.set(questionNo, questionObservation)
      for (const label of ['A', 'B', 'C']) {
        const optionObservation = addObservation({
          document: questionsEntry.document,
          adapterId: 'listening-questions-source',
          kind: 'listening_option',
          observationId:
            `observation:${suffix}:question:${questionNo}:option:${label}`,
          target: {
            kind: 'inactive_option',
            id: `option:listening:${questionNo}:${label}`,
          },
          value: {
            questionNo,
            label,
            text: question.options[label],
          },
        })
        optionObservations.set(`${questionNo}:${label}`, optionObservation)
      }
      const answer = answers[String(questionNo)]
      const answerObservation = addObservation({
        document: answersEntry.document,
        adapterId: 'listening-answers-source',
        kind: 'listening_official_answer',
        observationId: `observation:${suffix}:answer:${questionNo}`,
        target: {
          kind: 'inactive_official_answer',
          id: `answer:listening:${questionNo}`,
        },
        value: { questionNo, label: answer },
      })
      answerObservations.set(questionNo, answerObservation)
      const answerJoin = ledger.join({
        left: answerObservation,
        right: optionObservations.get(`${questionNo}:${answer}`),
        target: {
          kind: 'inactive_answer_join',
          id: `answer-join:listening:${questionNo}`,
        },
      })
      sourceMapEntries.push(answerJoin.sourceMapEntry)
    }
    for (const textId of spec.textIds) {
      const text = transcriptById.get(textId)
      transcriptObservations.set(textId, addObservation({
        document: transcriptEntry.document,
        adapterId: 'listening-transcript-source',
        kind: 'listening_transcript_segment',
        observationId: `observation:${suffix}:transcript:${textId}`,
        target: {
          kind: 'inactive_transcript_segment',
          id: `transcript:${textId}`,
        },
        value: text,
      }))
      if (inventoryEntry.value.timing.disposition === 'supplied') {
        addObservation({
          document: transcriptEntry.document,
          adapterId: 'listening-transcript-source',
          kind: 'listening_timing',
          observationId: `observation:${suffix}:timing:${textId}`,
          target: { kind: 'inactive_timing', id: `timing:${textId}` },
          value: timingByTextId.get(textId),
        })
      }
    }
    for (const questionNo of spec.questionNumbers) {
      const question = questionsByNumber.get(questionNo)
      const textId = spec.slotId === 'listening.short-dialogue'
        ? shortTextByQuestion.get(questionNo)
        : question.textRef
      const transcriptJoin = ledger.join({
        left: questionObservations.get(questionNo),
        right: transcriptObservations.get(textId),
        target: {
          kind: 'inactive_transcript_join',
          id: `transcript-join:listening:${questionNo}`,
        },
      })
      sourceMapEntries.push(transcriptJoin.sourceMapEntry)
      source.assertions.push({
        assertionId: `answer:listening:${questionNo}`,
        questionId: `question:listening:${questionNo}`,
        answer: answers[String(questionNo)],
        authority: 'official',
        sourceSpanId: answerObservations.get(questionNo).sourceSpanId,
      })
    }
    const sourceSliceRefs = [...new Set(
      sourceMapEntries.flatMap((entry) => entry.sourceSpanRefs),
    )]
    const transformationRecordIds = [...new Set(
      sourceMapEntries.flatMap((entry) => entry.transformationRecordIds),
    )]
    const closureBase = {
      scopeId: `inactive-source-closure:${source.paperId}:${spec.slotId}`,
      slotId: spec.slotId,
      contractRef: {
        id: 'listening-raw-closure',
        version: 'nck1-v1',
      },
      status: 'closed',
      sourceSliceRefs,
      questionCount: spec.questionNumbers.length,
      optionLabels: ['A', 'B', 'C'],
      officialAnswerCount: spec.questionNumbers.length,
      transcriptSegmentCount: 5,
      transcriptCoverage: 'exactly_once',
      timing: transcriptResult.timing,
      audio: inventoryResult.audio,
      sourceMap: { entries: sourceMapEntries },
      transformationRecordIds,
    }
    const closure = {
      ...closureBase,
      closureDigest: digestJson(closureBase),
    }
    source.inactiveSlots[spec.slotId] = sourceSliceRefs
    source.inactiveSourceClosures.push(closure)
  }
}
