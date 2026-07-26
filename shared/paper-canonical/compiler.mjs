import { canonicalAuthorityRef, resolveCanonicalAuthority, slotsForProfile, validateJsonSchema } from './authority.mjs'
import { cloneJson, digestJson, exactKeys, isRecordValue, sha256, stableStringify, withoutKey } from './stable.mjs'

const blockingPriority = ['answer_conflict', 'incomplete_source', 'unsupported', 'needs_review']

function diagnostic(code, disposition, path, message, sourceSpanRefs = []) {
  return { code, disposition, path, message, sourceSpanRefs }
}

function dispositionFor(diagnostics) {
  return blockingPriority.find((candidate) => diagnostics.some((item) => item.disposition === candidate)) || 'ready'
}

function asBytes(value) {
  return value instanceof Uint8Array ? value : null
}

function bytesToBase64(bytes) {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  return btoa(binary)
}

function stableId(prefix, value) {
  return `${prefix}:${digestJson(value).slice('sha256:'.length, 28)}`
}

function captureRequestEvidence(request) {
  const diagnostics = []
  const documents = []
  const sourceDocuments = request?.evidence?.documents
  if (!Array.isArray(sourceDocuments) || sourceDocuments.length === 0) {
    diagnostics.push(diagnostic('SOURCE_DOCUMENTS_MISSING', 'incomplete_source', '$.evidence.documents', 'At least one immutable source document is required'))
  }
  for (const [index, input] of (sourceDocuments || []).entries()) {
    const bytes = asBytes(input?.bytes)
    if (!input || typeof input.inputKey !== 'string' || !Array.isArray(input.roles) || !bytes) {
      diagnostics.push(diagnostic('SOURCE_DOCUMENT_INVALID', 'incomplete_source', `$.evidence.documents[${index}]`, 'Source documents require inputKey, roles, and immutable bytes'))
      continue
    }
    const documentDigest = sha256(bytes)
    const artifactId = stableId('source-document', { sha256: documentDigest })
    documents.push({
      documentId: stableId('document', { digest: documentDigest, roles: input.roles, inputKey: input.inputKey }),
      inputKey: input.inputKey,
      roles: [...input.roles],
      mediaType: input.declared?.mediaType || 'application/octet-stream',
      originalName: input.declared?.originalName || null,
      byteLength: bytes.byteLength,
      sha256: documentDigest,
      immutableArtifactRef: {
        artifactId,
        relativePath: `source-evidence/${artifactId.slice('source-document:'.length)}.bin`,
        sha256: documentDigest,
        byteLength: bytes.byteLength,
      },
      encodedBytes: bytesToBase64(bytes),
      bytes,
    })
  }
  return { documents, diagnostics }
}

function parseFixtureEvidence(documents, diagnostics) {
  const source = documents.find((document) => document.mediaType === 'application/vnd.eqb.canonical-fixture+json')
  if (!source) {
    diagnostics.push(diagnostic('SOURCE_ADAPTER_UNSUPPORTED', 'unsupported', '$.evidence.documents', 'No registered source adapter can read the supplied evidence'))
    return null
  }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(source.bytes))
    if (!isRecordValue(parsed)) throw new TypeError('Fixture root is not an object')
    return { source, value: parsed }
  } catch (error) {
    diagnostics.push(diagnostic('SOURCE_DOCUMENT_UNREADABLE', 'incomplete_source', '$.evidence.documents', `Fixture evidence is unreadable: ${error.message}`))
    return null
  }
}

function buildSourceCapture(documents, parsed, diagnostics) {
  const observations = []
  const sourceSpans = []
  const assertions = []
  const observationIds = new Set()
  const inputObservations = parsed?.value?.observations || []
  for (const [index, observation] of inputObservations.entries()) {
    if (!isRecordValue(observation) || typeof observation.observationId !== 'string' || typeof observation.kind !== 'string' || typeof observation.documentInputKey !== 'string') {
      diagnostics.push(diagnostic('OBSERVATION_INVALID', 'incomplete_source', `$.observations[${index}]`, 'Observations need a stable id, kind, and source document key'))
      continue
    }
    if (observationIds.has(observation.observationId)) {
      diagnostics.push(diagnostic('OBSERVATION_DUPLICATE', 'incomplete_source', `$.observations[${index}]`, 'Observation identities must identify exactly one source fact'))
      continue
    }
    const document = documents.find((candidate) => candidate.inputKey === observation.documentInputKey)
    const start = observation.span?.start
    const end = observation.span?.end
    if (!document || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > document.byteLength) {
      diagnostics.push(diagnostic('SOURCE_SPAN_INVALID', 'incomplete_source', `$.observations[${index}]`, 'Observation span is not closed against immutable document bytes'))
      continue
    }
    const sourceSpanId = `source-span:${observation.observationId}`
    observationIds.add(observation.observationId)
    observations.push({
      observationId: observation.observationId,
      documentId: document.documentId,
      kind: observation.kind,
      value: observation.value ?? null,
      order: index,
      extraction: { adapterId: 'canonical-fixture-evidence', version: '1' },
      sourceSpanId,
    })
    sourceSpans.push({
      sourceSpanId,
      documentId: document.documentId,
      documentDigest: document.sha256,
      coordinate: { kind: 'byte_range', start, end },
    })
  }
  for (const [index, assertion] of (parsed?.value?.assertions || []).entries()) {
    if (!isRecordValue(assertion) || typeof assertion.assertionId !== 'string' || typeof assertion.questionId !== 'string' || typeof assertion.answer !== 'string' || typeof assertion.sourceSpanId !== 'string') {
      diagnostics.push(diagnostic('ASSERTION_INVALID', 'incomplete_source', `$.assertions[${index}]`, 'Answer assertions require identity, answer, question, and source span'))
      continue
    }
    if (!sourceSpans.some((span) => span.sourceSpanId === assertion.sourceSpanId)) {
      diagnostics.push(diagnostic('ASSERTION_SOURCE_UNRESOLVED', 'incomplete_source', `$.assertions[${index}]`, 'Answer assertion does not resolve to a source span'))
      continue
    }
    assertions.push({
      assertionId: assertion.assertionId,
      questionId: assertion.questionId,
      answer: assertion.answer,
      authority: assertion.authority || 'official',
      sourceSpanId: assertion.sourceSpanId,
    })
  }
  const serializedDocuments = documents.map(({ bytes: _bytes, ...document }) => document)
  const captureBase = {
    schemaVersion: 'source-capture-v1',
    documents: serializedDocuments,
    observations,
    sourceSpans,
    assertions,
  }
  const digest = digestJson(captureBase)
  return { ...captureBase, captureId: stableId('source-capture', captureBase), digest }
}

function validateCapture(capture, closure) {
  return validateJsonSchema(capture, closure.schemas['source-capture-v1'], '$.sourceCapture')
}

function validateAnswerAssertions(capture, diagnostics) {
  const byQuestion = new Map()
  for (const assertion of capture.assertions.filter((item) => item.authority === 'official')) {
    const answers = byQuestion.get(assertion.questionId) || new Set()
    answers.add(assertion.answer)
    byQuestion.set(assertion.questionId, answers)
  }
  for (const [questionId, answers] of byQuestion) {
    if (answers.size > 1) diagnostics.push(diagnostic('OFFICIAL_ANSWER_CONFLICT', 'answer_conflict', '$.assertions', `Authoritative answers conflict for ${questionId}`))
  }
}

function validateAnswerCoverage(source, capture, diagnostics) {
  const officialQuestionIds = new Set(
    capture.assertions
      .filter((assertion) => assertion.authority === 'official')
      .map((assertion) => assertion.questionId),
  )
  for (const group of source.groups || []) {
    for (const questionId of group.questionIds || []) {
      if (!officialQuestionIds.has(questionId)) {
        diagnostics.push(diagnostic('OFFICIAL_ANSWER_MISSING', 'incomplete_source', '$.assertions', `Missing official answer evidence for ${questionId}`))
      }
    }
  }
}

export function validateExactTransformationRecords(records, capture, closure) {
  const diagnostics = []
  const legacyAuthority = closure.authorityRef.manifestVersion === '1'
  const registeredRules = new Map(closure.artifacts.normalization.rules.map((rule) => [`${rule.ruleId}@${rule.version}`, rule]))
  const sourceSpanIds = new Set(capture.sourceSpans.map((span) => span.sourceSpanId))
  const observationsById = new Map(capture.observations.map((observation) => [observation.observationId, observation]))
  let previousSequence = 0
  const recordIds = new Set()
  const accepted = []
  for (const [index, record] of (records || []).entries()) {
    const path = `$.transformations[${index}]`
    if (!isRecordValue(record) || !exactKeys(record, ['recordId', 'sequence', 'ruleId', 'ruleVersion', 'target', 'operation', 'inputSourceSpanIds', 'before', 'after', 'certainty', 'preconditions', 'outputDigest']) || typeof record.recordId !== 'string' || typeof record.ruleId !== 'string' || typeof record.ruleVersion !== 'string' || typeof record.operation !== 'string' || !isRecordValue(record.target) || !exactKeys(record.target, ['identity', 'path']) || typeof record.target.identity !== 'string' || typeof record.target.path !== 'string') {
      diagnostics.push(diagnostic('TRANSFORMATION_SHAPE_INVALID', 'needs_review', path, 'Transformation records are closed ledger entries'))
      continue
    }
    const rule = registeredRules.get(`${record.ruleId}@${record.ruleVersion}`)
    const proof = rule?.operationProofs?.[record.operation] || (legacyAuthority ? legacyOperationProof(record.operation) : null)
    if (record.certainty !== 'exact' || !rule || !rule.allowedOperations.includes(record.operation) || !proof) {
      diagnostics.push(diagnostic('TRANSFORMATION_NOT_EXACT', 'needs_review', path, 'Only registered exact transformations can produce canonical semantics'))
      continue
    }
    const observationIds = record.preconditions?.sourceObservationIds
    const observations = Array.isArray(observationIds) ? observationIds.map((observationId) => observationsById.get(observationId)) : []
    const expectedPreconditions = observations.length === proof.observationArity && observations.every(Boolean)
      ? {
          sourceObservationIds: [...observationIds],
          sourceValueDigests: observations.map((observation) => digestJson(observation.value)),
        }
      : null
    const expectedSpanIds = observations.map((observation) => observation.sourceSpanId)
    const sourceIdentityProof = proof.kind === 'source_identity' && observations.length === 1 && observations[0] && stableStringify(record.before) === stableStringify(observations[0].value) && stableStringify(record.after) === stableStringify(observations[0].value)
    const joinValue = expectedPreconditions && { sourceObservationIds: expectedPreconditions.sourceObservationIds, sourceValueDigests: expectedPreconditions.sourceValueDigests }
    const uniqueJoinProof = proof.kind === 'unique_observation_join' && observations.length === 2 && new Set(observationIds).size === 2 && stableStringify(record.before) === stableStringify(joinValue) && stableStringify(record.after) === stableStringify(joinValue) && isRecordValue(record.target) && exactKeys(record.target, ['identity', 'path']) && record.target.path === 'source_join' && record.target.identity === stableId('source-join', joinValue)
    const exactProof = expectedPreconditions && stableStringify(record.preconditions) === stableStringify(expectedPreconditions) && stableStringify(record.inputSourceSpanIds) === stableStringify(expectedSpanIds) && (sourceIdentityProof || uniqueJoinProof)
    if (recordIds.has(record.recordId) || !Number.isInteger(record.sequence) || record.sequence <= previousSequence || !Array.isArray(record.inputSourceSpanIds) || record.inputSourceSpanIds.length === 0 || record.inputSourceSpanIds.some((id) => !sourceSpanIds.has(id)) || record.outputDigest !== digestJson(record.after) || !exactProof) {
      diagnostics.push(diagnostic('TRANSFORMATION_CLOSURE_INVALID', 'needs_review', path, 'Transformation sequence, lineage, or output digest cannot be replayed'))
      continue
    }
    previousSequence = record.sequence
    recordIds.add(record.recordId)
    accepted.push(cloneJson(record))
  }
  return { diagnostics, records: accepted }
}

function legacyOperationProof(operation) {
  if (operation === 'exact_join') return { kind: 'unique_observation_join', observationArity: 2 }
  if (['direct_projection', 'structural_tokenization', 'anchor_identity', 'representation_normalization'].includes(operation)) return { kind: 'source_identity', observationArity: 1 }
  return null
}

function collectRichTargetIds(content) {
  const targets = []
  function inlines(values) {
    for (const inline of values || []) targets.push({ kind: inline.kind === 'blank_ref' ? 'blank' : 'content_node', id: inline.kind === 'blank_ref' ? inline.blankId : inline.nodeId })
  }
  for (const block of content?.blocks || []) {
    targets.push({ kind: 'content_node', id: block.nodeId })
    if (block.kind === 'paragraph') inlines(block.inlines)
    if (block.kind === 'figure') inlines(block.caption)
    if (block.kind === 'table') for (const row of block.rows || []) for (const cell of row.cells || []) {
      targets.push({ kind: 'content_node', id: cell.cellId })
      inlines(cell.inlines)
    }
  }
  return targets
}

function validateInlines(inlines, blankIds, path, diagnostics, ids) {
  if (!Array.isArray(inlines)) {
    diagnostics.push(diagnostic('RICH_INLINE_INVALID', 'needs_review', path, 'Inlines must be ordered'))
    return
  }
  for (const [index, inline] of inlines.entries()) {
    const inlinePath = `${path}[${index}]`
    if (!isRecordValue(inline) || (inline.kind === 'text' && !exactKeys(inline, ['kind', 'nodeId', 'text'])) || (inline.kind === 'blank_ref' && !exactKeys(inline, ['kind', 'nodeId', 'blankId']))) {
      diagnostics.push(diagnostic('RICH_INLINE_SHAPE', 'needs_review', inlinePath, 'Only literal text and semantic blank refs are allowed'))
      continue
    }
    if (ids.has(inline.nodeId)) diagnostics.push(diagnostic('RICH_NODE_DUPLICATE', 'needs_review', inlinePath, 'Rich node ids must be unique'))
    ids.add(inline.nodeId)
    if (inline.kind === 'blank_ref' && !blankIds.has(inline.blankId)) diagnostics.push(diagnostic('RICH_BLANK_UNRESOLVED', 'needs_review', inlinePath, 'Blank ref is not declared by the group'))
  }
}

function validateRichContent(content, blankIds, mediaIds) {
  const diagnostics = []
  const ids = new Set()
  if (!isRecordValue(content) || !exactKeys(content, ['blocks']) || !Array.isArray(content.blocks)) {
    return [diagnostic('RICH_CONTENT_INVALID', 'needs_review', '$.content', 'Rich content must be a closed block document')]
  }
  for (const [index, block] of content.blocks.entries()) {
    const path = `$.content.blocks[${index}]`
    if (!isRecordValue(block) || typeof block.kind !== 'string' || typeof block.nodeId !== 'string' || ids.has(block.nodeId)) {
      diagnostics.push(diagnostic('RICH_BLOCK_INVALID', 'needs_review', path, 'Blocks need unique identities'))
      continue
    }
    ids.add(block.nodeId)
    if (block.kind === 'paragraph') {
      if (!exactKeys(block, ['kind', 'nodeId', 'inlines'])) diagnostics.push(diagnostic('RICH_BLOCK_SHAPE', 'needs_review', path, 'Paragraph fields are closed'))
      validateInlines(block.inlines, blankIds, `${path}.inlines`, diagnostics, ids)
    } else if (block.kind === 'figure') {
      if (!exactKeys(block, ['kind', 'nodeId', 'mediaId', 'caption']) || !mediaIds.has(block.mediaId)) diagnostics.push(diagnostic('RICH_FIGURE_INVALID', 'unsupported', path, 'Figures need resolved captured media and no layout fields'))
      validateInlines(block.caption, blankIds, `${path}.caption`, diagnostics, ids)
    } else if (block.kind === 'table') {
      if (!exactKeys(block, ['kind', 'nodeId', 'columnCount', 'rows']) || !Number.isInteger(block.columnCount) || block.columnCount < 1 || !Array.isArray(block.rows)) {
        diagnostics.push(diagnostic('RICH_TABLE_INVALID', 'needs_review', path, 'Tables need a rectangular semantic grid'))
        continue
      }
      for (const [rowIndex, row] of block.rows.entries()) {
        if (!isRecordValue(row) || !exactKeys(row, ['rowId', 'cells']) || !Array.isArray(row.cells)) {
          diagnostics.push(diagnostic('RICH_TABLE_ROW_INVALID', 'needs_review', `${path}.rows[${rowIndex}]`, 'Table rows are closed'))
          continue
        }
        let covered = 0
        for (const [cellIndex, cell] of row.cells.entries()) {
          if (!isRecordValue(cell) || !exactKeys(cell, ['cellId', 'columnStart', 'columnSpan', 'rowSpan', 'role', 'inlines']) || cell.columnStart !== covered || !Number.isInteger(cell.columnSpan) || cell.columnSpan < 1 || !Number.isInteger(cell.rowSpan) || cell.rowSpan < 1 || !['header', 'data'].includes(cell.role)) {
            diagnostics.push(diagnostic('RICH_TABLE_CELL_INVALID', 'needs_review', `${path}.rows[${rowIndex}].cells[${cellIndex}]`, 'Table cells must establish a rectangular grid'))
            continue
          }
          covered += cell.columnSpan
          validateInlines(cell.inlines, blankIds, `${path}.rows[${rowIndex}].cells[${cellIndex}].inlines`, diagnostics, ids)
        }
        if (covered !== block.columnCount) diagnostics.push(diagnostic('RICH_TABLE_NOT_RECTANGULAR', 'needs_review', `${path}.rows[${rowIndex}]`, 'Cells do not cover the declared columns'))
      }
    } else {
      diagnostics.push(diagnostic('RICH_BLOCK_UNSUPPORTED', 'unsupported', path, 'Only paragraph, table, and figure blocks are representable'))
    }
  }
  return diagnostics
}

function validateChoiceOwnership(choiceOwnership, questionIds, expectedOwnership) {
  const diagnostics = []
  if (!isRecordValue(choiceOwnership) || choiceOwnership.ownership !== expectedOwnership) {
    return [diagnostic('CHOICE_OWNERSHIP_INVALID', 'needs_review', '$.variant.choiceOwnership', 'Choice ownership must match its family contract')]
  }
  if (expectedOwnership === 'none') {
    if (!exactKeys(choiceOwnership, ['ownership'])) diagnostics.push(diagnostic('CHOICE_OWNERSHIP_SHAPE', 'needs_review', '$.variant.choiceOwnership', 'Non-choice families cannot carry option fields'))
  } else if (expectedOwnership === 'shared_bank') {
    if (!exactKeys(choiceOwnership, ['ownership', 'bankId', 'options']) || !Array.isArray(choiceOwnership.options) || choiceOwnership.options.length === 0) diagnostics.push(diagnostic('SHARED_BANK_INVALID', 'needs_review', '$.variant.choiceOwnership', 'A shared bank is group-owned and closed'))
  } else {
    if (!exactKeys(choiceOwnership, ['ownership', 'sets']) || !Array.isArray(choiceOwnership.sets)) diagnostics.push(diagnostic('PER_QUESTION_OPTIONS_INVALID', 'needs_review', '$.variant.choiceOwnership', 'Per-question choices require closed sets'))
    else {
      const setIds = choiceOwnership.sets.map((set) => set.questionId)
      if (new Set(setIds).size !== setIds.length || setIds.length !== questionIds.length || setIds.some((questionId) => !questionIds.includes(questionId))) diagnostics.push(diagnostic('PER_QUESTION_OPTIONS_COVERAGE', 'needs_review', '$.variant.choiceOwnership', 'Choice sets must cover each question exactly once'))
    }
  }
  return diagnostics
}

function buildGroupArtifact(sourceGroup, capture, closure, acceptedRecords) {
  const diagnostics = []
  const family = closure.families.get(sourceGroup?.family)
  if (!family) return { diagnostics: [diagnostic('GROUP_FAMILY_UNSUPPORTED', 'unsupported', '$.groups', 'Group family is not represented by the authority')], artifact: null }
  if (!isRecordValue(sourceGroup) || typeof sourceGroup.groupId !== 'string' || typeof sourceGroup.slotId !== 'string' || !Array.isArray(sourceGroup.questionIds) || !Array.isArray(sourceGroup.blankIds) || typeof sourceGroup.sourceSpanId !== 'string') {
    return { diagnostics: [diagnostic('GROUP_SOURCE_INVALID', 'incomplete_source', '$.groups', 'A group needs identity, slot, ordered refs, and direct source span')], artifact: null }
  }
  const sourceSpanIds = new Set(capture.sourceSpans.map((span) => span.sourceSpanId))
  if (!sourceSpanIds.has(sourceGroup.sourceSpanId)) diagnostics.push(diagnostic('GROUP_SOURCE_UNRESOLVED', 'incomplete_source', '$.groups', 'Group does not resolve to a captured source span'))
  if (new Set(sourceGroup.questionIds).size !== sourceGroup.questionIds.length || new Set(sourceGroup.blankIds).size !== sourceGroup.blankIds.length) diagnostics.push(diagnostic('GROUP_MEMBER_DUPLICATE', 'needs_review', '$.groups', 'Question and Blank identities are unique'))
  const media = cloneJson(sourceGroup.media || []).map((item) => ({
    ...item,
    sourceArtifactRef: {
      captureId: capture.captureId,
      artifactId: item?.sourceArtifactRef?.artifactId,
    },
  }))
  const mediaIds = new Set()
  for (const [index, item] of media.entries()) {
    if (!isRecordValue(item) || !exactKeys(item, ['mediaId', 'mimeType', 'sha256', 'pixelWidth', 'pixelHeight', 'sourceArtifactRef']) || mediaIds.has(item.mediaId)) diagnostics.push(diagnostic('MEDIA_INVALID', 'incomplete_source', `$.groups.media[${index}]`, 'Media must be source-linked immutable evidence'))
    mediaIds.add(item.mediaId)
  }
  const content = cloneJson(sourceGroup.content || { blocks: [] })
  diagnostics.push(...validateRichContent(content, new Set(sourceGroup.blankIds), mediaIds))
  const variant = cloneJson(sourceGroup.variant || {})
  if (!exactKeys(variant, ['family', 'choiceOwnership']) || variant.family !== family.familyContractId) diagnostics.push(diagnostic('GROUP_VARIANT_INVALID', 'needs_review', '$.groups.variant', 'Variant family must match the closed contract'))
  diagnostics.push(...validateChoiceOwnership(variant.choiceOwnership, sourceGroup.questionIds, family.choiceOwnership))
  if (diagnostics.length > 0) return { diagnostics, artifact: null }
  const artifactBase = {
    schemaVersion: 'canonical-question-group-v1',
    identity: { paperId: sourceGroup.paperId || null, groupId: sourceGroup.groupId },
    contractRef: {
      manifestId: closure.authorityRef.manifestId,
      manifestVersion: closure.authorityRef.manifestVersion,
      manifestDigest: closure.authorityRef.manifestDigest,
      familyContractId: family.familyContractId,
      familyContractVersion: family.version,
      familyContractDigest: digestJson(family),
    },
    questionRefs: sourceGroup.questionIds.map((questionId) => ({ questionId })),
    blankRefs: sourceGroup.blankIds.map((blankId) => ({ blankId })),
    content,
    media,
    variant,
  }
  const targetEntries = [
    { target: { kind: 'group', id: sourceGroup.groupId } },
    ...sourceGroup.questionIds.map((id) => ({ target: { kind: 'question', id } })),
    ...sourceGroup.blankIds.map((id) => ({ target: { kind: 'blank', id } })),
    ...media.map((item) => ({ target: { kind: 'media', id: item.mediaId } })),
    ...collectRichTargetIds(content).map((entry) => ({ target: entry })),
  ].filter((entry, index, entries) => entries.findIndex((candidate) => candidate.target.kind === entry.target.kind && candidate.target.id === entry.target.id) === index)
  const sourceMap = {
    captureId: capture.captureId,
    entries: targetEntries.map((entry) => ({
      ...entry,
      sourceSpanRefs: [sourceGroup.sourceSpanId],
      transformationRecordIds: acceptedRecords.filter((record) => record.target?.identity === sourceGroup.groupId).map((record) => record.recordId),
    })),
  }
  const sourceFingerprint = digestJson({ captureDigest: capture.digest, sourceSpanId: sourceGroup.sourceSpanId, recordIds: sourceMap.entries.flatMap((entry) => entry.transformationRecordIds) })
  const semanticDigest = digestJson(artifactBase)
  const artifact = { ...artifactBase, sourceMap, sourceFingerprint, semanticDigest }
  diagnostics.push(...validateJsonSchema(artifact, closure.schemas['canonical-question-group-v1'], '$.group'))
  return { diagnostics, artifact }
}

function buildPlan(source, capture, closure, groups, acceptedRecords, reviewDecisions) {
  const diagnostics = []
  const profile = closure.profiles.get(source.profileId)
  if (!profile) return { diagnostics: [diagnostic('PROFILE_UNSUPPORTED', 'unsupported', '$.profileId', 'The source paper does not map to an exact Profile')], plan: null }
  const groupBySlot = new Map()
  for (const group of groups) {
    if (groupBySlot.has(group.slotId)) diagnostics.push(diagnostic('GROUP_SLOT_DUPLICATE', 'needs_review', '$.groups', `Several groups map to ${group.slotId}`))
    groupBySlot.set(group.slotId, group)
  }
  const slots = slotsForProfile(profile)
  const allowedSlots = new Set(slots.map((slot) => slot.slotId))
  for (const group of groups) if (!allowedSlots.has(group.slotId)) diagnostics.push(diagnostic('GROUP_SLOT_UNEXPECTED', 'unsupported', '$.groups', `Unknown profile slot ${group.slotId}`))
  const bindings = []
  const numberingAssignments = []
  for (const slot of slots) {
    if (slot.activation === 'inactive_source') {
      const sourceSliceRefs = source.inactiveSlots?.[slot.slotId]
      if (!Array.isArray(sourceSliceRefs) || sourceSliceRefs.length === 0 || sourceSliceRefs.some((id) => !capture.sourceSpans.some((span) => span.sourceSpanId === id))) {
        diagnostics.push(diagnostic('INACTIVE_SOURCE_MISSING', 'incomplete_source', `$.inactiveSlots.${slot.slotId}`, 'Required inactive source closure is missing'))
      } else {
        bindings.push({ slotId: slot.slotId, state: 'inactive', sourceSliceRefs: [...sourceSliceRefs] })
      }
      continue
    }
    const group = groupBySlot.get(slot.slotId)
    if (!group) {
      diagnostics.push(diagnostic('ACTIVE_GROUP_MISSING', 'incomplete_source', `$.groups`, `Required active slot ${slot.slotId} is missing`))
      continue
    }
    if (group.variant.family !== slot.familyContractRef.id) {
      diagnostics.push(diagnostic('GROUP_PROFILE_FAMILY_MISMATCH', 'needs_review', `$.groups.${group.groupId}`, 'Group family disagrees with Profile slot'))
      continue
    }
    if (slot.questionCardinality.kind === 'exact' && group.questionRefs.length !== slot.questionCardinality.count) {
      diagnostics.push(diagnostic('GROUP_CARDINALITY_MISMATCH', 'needs_review', `$.groups.${group.groupId}`, 'Group question cardinality does not match Profile slot'))
      continue
    }
    bindings.push({ slotId: slot.slotId, state: 'bound', groupRef: { groupId: group.identity.groupId } })
    if (slot.numberingRule.kind === 'range') {
      group.questionRefs.forEach((question, index) => numberingAssignments.push({
        slotId: slot.slotId,
        groupId: group.identity.groupId,
        questionId: question.questionId,
        sourceNumberSpan: group.sourceMap.entries.find((entry) => entry.target.kind === 'question' && entry.target.id === question.questionId)?.sourceSpanRefs[0] || group.sourceMap.entries[0]?.sourceSpanRefs[0],
        canonicalNumber: slot.numberingRule.start + index,
      }))
    }
  }
  if (diagnostics.length > 0) return { diagnostics, plan: null }
  const legacyAuthority = closure.authorityRef.manifestVersion === '1'
  const profileDigest = digestJson(profile)
  const reviewDecisionDigest = legacyAuthority ? null : digestJson(reviewDecisions)
  const plan = {
    schemaVersion: 'canonical-paper-plan-v1',
    planId: stableId('plan', legacyAuthority
      ? { paperId: source.paperId, captureDigest: capture.digest, profileDigest }
      : { paperId: source.paperId, captureDigest: capture.digest, profileDigest, reviewDecisionDigest }),
    paperId: source.paperId,
    authorityRef: closure.authorityRef,
    profileRef: { profileId: profile.profileId, profileVersion: profile.version, profileDigest },
    slotBindings: bindings,
    numberingAssignments,
    sourceConformance: legacyAuthority
      ? {
          status: acceptedRecords.length > 0 ? 'exact_deviations_applied' : 'direct',
          transformationRecordIds: acceptedRecords.map((record) => record.recordId),
        }
      : {
          status: acceptedRecords.length > 0 ? 'exact_deviations_applied' : 'direct',
          transformationRecordIds: acceptedRecords.map((record) => record.recordId),
          reviewDecisionIds: reviewDecisions.map((decision) => decision.decisionId),
          reviewDecisionDigest,
        },
    completeness: { status: 'complete', optionalOmissions: [] },
  }
  diagnostics.push(...validateJsonSchema(plan, closure.schemas['canonical-paper-plan-v1'], '$.plan'))
  return { diagnostics, plan }
}

function normalizeReviewDecisions(value, capture, diagnostics) {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    diagnostics.push(diagnostic('REVIEW_DECISIONS_INVALID', 'needs_review', '$.reviewDecisions', 'Review decisions must be an ordered explicit input'))
    return []
  }
  const spanIds = new Set(capture.sourceSpans.map((span) => span.sourceSpanId))
  const decisionIds = new Set()
  const decisions = []
  for (const [index, decision] of value.entries()) {
    const path = `$.reviewDecisions[${index}]`
    if (!isRecordValue(decision) || !exactKeys(decision, ['decisionId', 'ambiguityId', 'selectedCandidateId', 'sourceSpanRefs']) || typeof decision.decisionId !== 'string' || typeof decision.ambiguityId !== 'string' || typeof decision.selectedCandidateId !== 'string' || !Array.isArray(decision.sourceSpanRefs) || decision.sourceSpanRefs.length === 0 || decision.sourceSpanRefs.some((sourceSpanId) => !spanIds.has(sourceSpanId)) || decisionIds.has(decision.decisionId)) {
      diagnostics.push(diagnostic('REVIEW_DECISION_INVALID', 'needs_review', path, 'Review decisions require identity, selected candidate, and captured evidence spans'))
      continue
    }
    decisionIds.add(decision.decisionId)
    decisions.push(cloneJson(decision))
  }
  return decisions
}

function validateAmbiguities(ambiguities, reviewDecisions, diagnostics) {
  const decisionsByAmbiguity = new Map(reviewDecisions.map((decision) => [decision.ambiguityId, decision]))
  for (const [index, ambiguity] of (ambiguities || []).entries()) {
    const path = `$.ambiguities[${index}]`
    if (!isRecordValue(ambiguity)) {
      diagnostics.push(diagnostic('AMBIGUOUS_SOURCE_SEMANTICS', 'needs_review', path, String(ambiguity)))
      continue
    }
    if (!exactKeys(ambiguity, ['ambiguityId', 'candidates', 'sourceSpanRefs']) || typeof ambiguity.ambiguityId !== 'string' || !Array.isArray(ambiguity.candidates) || ambiguity.candidates.length < 2 || ambiguity.candidates.some((candidate) => typeof candidate !== 'string') || !Array.isArray(ambiguity.sourceSpanRefs) || ambiguity.sourceSpanRefs.length === 0) {
      diagnostics.push(diagnostic('AMBIGUITY_INVALID', 'needs_review', path, 'Ambiguity candidates require identity and source evidence'))
      continue
    }
    const decision = decisionsByAmbiguity.get(ambiguity.ambiguityId)
    const sameSpans = decision && decision.sourceSpanRefs.length === ambiguity.sourceSpanRefs.length && decision.sourceSpanRefs.every((sourceSpanId) => ambiguity.sourceSpanRefs.includes(sourceSpanId))
    if (!decision || !ambiguity.candidates.includes(decision.selectedCandidateId) || !sameSpans) {
      diagnostics.push(diagnostic('AMBIGUOUS_SOURCE_SEMANTICS', 'needs_review', path, `No explicit evidence-bound decision resolves ${ambiguity.ambiguityId}`))
    }
  }
}

function makeReport({ disposition, capture, authority, groups = [], records = [], reviewDecisions = [], diagnostics = [] }) {
  const legacyAuthority = authority?.manifestVersion === '1'
  const report = {
    schemaVersion: `normalization-report-v${authority?.manifestVersion || '2'}`,
    disposition,
    authority,
    captureDigest: capture.digest,
    sourceFingerprint: digestJson({ captureDigest: capture.digest, groupFingerprints: groups.map((group) => group.sourceFingerprint) }),
    directSourceMap: groups.flatMap((group) => group.sourceMap.entries),
    transformationRecords: records,
    ...(legacyAuthority ? {} : { reviewDecisions }),
    diagnostics,
  }
  if (disposition === 'ready') report.semanticDigest = legacyAuthority
    ? digestJson({ groups: groups.map((group) => group.semanticDigest) })
    : digestJson({ groups: groups.map((group) => group.semanticDigest), reviewDecisionDigest: digestJson(reviewDecisions) })
  return report
}

function blockedResult(disposition, capture, authority, diagnostics, records = [], reviewDecisions = []) {
  return { disposition, artifacts: { sourceCapture: capture, normalizationReport: makeReport({ disposition, capture, authority, records, reviewDecisions, diagnostics }) } }
}

/**
 * Pure whole-paper entry point. The request contains evidence bytes and an
 * exact authority reference; profiles, adapters, renderers, storage, and
 * caller mode are deliberately not caller-selectable.
 */
export function compileCanonicalPaper(request) {
  const { documents, diagnostics } = captureRequestEvidence(request)
  const parsed = parseFixtureEvidence(documents, diagnostics)
  const capture = buildSourceCapture(documents, parsed, diagnostics)
  const reviewDecisions = normalizeReviewDecisions(request?.reviewDecisions, capture, diagnostics)
  const authorityResolution = resolveCanonicalAuthority(request?.authority)
  if (!authorityResolution.ok) {
    diagnostics.push(...authorityResolution.issues.map((item) => diagnostic(item.code, 'unsupported', item.path, item.message)))
    return blockedResult(dispositionFor(diagnostics), capture, request?.authority || null, diagnostics, [], reviewDecisions)
  }
  const closure = authorityResolution.closure
  if (closure.authorityRef.manifestDigest !== canonicalAuthorityRef.manifestDigest) {
    diagnostics.push(diagnostic('AUTHORITY_RETIRED', 'unsupported', '$.authority', 'Only the current canonical authority may compile new papers'))
    return blockedResult(dispositionFor(diagnostics), capture, closure.authorityRef, diagnostics, [], [])
  }
  const effectiveReviewDecisions = closure.authorityRef.manifestVersion === '1' ? [] : reviewDecisions
  diagnostics.push(...validateCapture(capture, closure).map((item) => diagnostic(item.code, 'incomplete_source', item.path, item.message)))
  if (!parsed) return blockedResult(dispositionFor(diagnostics), capture, closure.authorityRef, diagnostics, [], reviewDecisions)
  const source = parsed.value
  if (typeof source.paperId !== 'string' || typeof source.profileId !== 'string' || !Array.isArray(source.groups)) {
    diagnostics.push(diagnostic('FIXTURE_SOURCE_SHAPE_INVALID', 'incomplete_source', '$', 'Source evidence does not close a paper, profile, and group list'))
  }
  validateAmbiguities(source.ambiguities, effectiveReviewDecisions, diagnostics)
  for (const marker of source.unsupportedFeatures || []) diagnostics.push(diagnostic('SOURCE_FEATURE_UNSUPPORTED', 'unsupported', '$.unsupportedFeatures', String(marker)))
  validateAnswerAssertions(capture, diagnostics)
  validateAnswerCoverage(source, capture, diagnostics)
  const transformations = validateExactTransformationRecords(source.transformations, capture, closure)
  diagnostics.push(...transformations.diagnostics)
  if (dispositionFor(diagnostics) !== 'ready') return blockedResult(dispositionFor(diagnostics), capture, closure.authorityRef, diagnostics, transformations.records, effectiveReviewDecisions)
  const builtGroups = []
  for (const rawGroup of source.groups) {
    const built = buildGroupArtifact({ ...rawGroup, paperId: source.paperId }, capture, closure, transformations.records)
    diagnostics.push(...built.diagnostics)
    if (built.artifact) builtGroups.push({ ...built.artifact, slotId: rawGroup.slotId })
  }
  if (dispositionFor(diagnostics) !== 'ready') return blockedResult(dispositionFor(diagnostics), capture, closure.authorityRef, diagnostics, transformations.records, effectiveReviewDecisions)
  const planResult = buildPlan(source, capture, closure, builtGroups, transformations.records, effectiveReviewDecisions)
  diagnostics.push(...planResult.diagnostics)
  if (dispositionFor(diagnostics) !== 'ready') return blockedResult(dispositionFor(diagnostics), capture, closure.authorityRef, diagnostics, transformations.records, effectiveReviewDecisions)
  const groups = builtGroups.map(({ slotId: _slotId, ...group }) => group)
  const report = makeReport({ disposition: 'ready', capture, authority: closure.authorityRef, groups, records: transformations.records, reviewDecisions: effectiveReviewDecisions, diagnostics })
  const reportIssues = validateJsonSchema(report, closure.schemas[`normalization-report-v${closure.authorityRef.manifestVersion}`], '$.normalizationReport')
  if (reportIssues.length > 0) {
    const mapped = reportIssues.map((item) => diagnostic(item.code, 'needs_review', item.path, item.message))
    return blockedResult('needs_review', capture, closure.authorityRef, [...diagnostics, ...mapped], transformations.records, effectiveReviewDecisions)
  }
  return {
    disposition: 'ready',
    artifacts: {
      sourceCapture: capture,
      canonicalPaper: { paperPlan: planResult.plan, questionGroups: groups },
      normalizationReport: report,
    },
  }
}

export { canonicalAuthorityRef, stableStringify }
