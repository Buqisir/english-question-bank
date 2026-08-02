import { readFileSync } from 'node:fs'
import { basename, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  digestJson,
  exactKeys,
  isRecordValue,
  sha256,
  withoutKey,
} from '../../shared/paper-canonical/stable.mjs'
import {
  resolveCanonicalAuthority,
  slotsForProfile,
  trustedLegacyCaptureCandidateAuthorityRef,
} from '../../shared/paper-canonical/authority.mjs'

export const TICKET_26_LEGACY_CAPTURE_INPUT_KIND = 'ticket-26-source-capture-v1'
export const TICKET_26_LEGACY_CAPTURE_MEDIA_TYPE = 'application/vnd.eqb.ticket-26-source-capture+json'
export const TICKET_26_LEGACY_SOURCE_ENVELOPE_MEDIA_TYPE = 'application/vnd.eqb.ticket-26-legacy-source-envelope+json'

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '')
const batchRelativePath = 'test-fixtures/paper-import/paper-canonical-source-captures/ticket-26-v1/batch-evidence.json'
const manifestRelativePath = 'docs/cuts/paper-canonical-unification/migration/manifest-v1.json'
const ledgerRelativePath = 'docs/cuts/paper-canonical-unification/migration/ledger-v1.json'
const expectedRoles = ['asset-projection', 'source-provenance', 'official-answer-lead']
const textDecoder = new TextDecoder()
const textEncoder = new TextEncoder()

let trustedRegistry

function fail(message) {
  throw new Error(`Ticket 26 legacy capture registry invalid: ${message}`)
}

function prefixedDigest(value) {
  return String(value).startsWith('sha256:') ? String(value) : `sha256:${value}`
}

function stableId(prefix, value) {
  return `${prefix}:${digestJson(value).slice('sha256:'.length, 28)}`
}

function sameBytes(left, right) {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index])
}

function sameStrings(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((value, index) => value === right[index])
}

function repositoryFile(relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || relativePath.includes('..')) {
    fail(`unsafe committed path ${String(relativePath)}`)
  }
  const absolutePath = resolve(repositoryRoot, relativePath)
  if (!absolutePath.startsWith(`${repositoryRoot}${sep}`)) fail(`committed path escapes the repository: ${relativePath}`)
  return new Uint8Array(readFileSync(absolutePath))
}

function parseJson(bytes, label) {
  try {
    const value = JSON.parse(textDecoder.decode(bytes))
    if (!isRecordValue(value)) fail(`${label} is not a JSON object`)
    return value
  } catch (error) {
    if (error.message.startsWith('Ticket 26 legacy capture registry invalid:')) throw error
    fail(`${label} is unreadable JSON: ${error.message}`)
  }
}

function decodeBase64(value, label) {
  if (typeof value !== 'string') fail(`${label} has no encodedBytes`)
  const bytes = new Uint8Array(Buffer.from(value, 'base64'))
  if (Buffer.from(bytes).toString('base64') !== value) fail(`${label} encodedBytes are not exact base64`)
  return bytes
}

function captureBase(capture) {
  return withoutKey(withoutKey(capture, 'captureId'), 'digest')
}

function validateSourceAuthority(batch) {
  if (!isRecordValue(batch.sourceAuthority) || !isRecordValue(batch.sourceAuthority.manifest) || !isRecordValue(batch.sourceAuthority.ledger)) {
    fail('batch lacks its frozen manifest and ledger binding')
  }
  const manifestRef = batch.sourceAuthority.manifest
  const ledgerRef = batch.sourceAuthority.ledger
  if (manifestRef.path !== manifestRelativePath || ledgerRef.path !== ledgerRelativePath) {
    fail('batch source authority paths drifted from Ticket 26')
  }
  const manifestBytes = repositoryFile(manifestRelativePath)
  const ledgerBytes = repositoryFile(ledgerRelativePath)
  if (sha256(manifestBytes) !== manifestRef.fileSha256 || sha256(ledgerBytes) !== ledgerRef.fileSha256) {
    fail('frozen manifest or ledger file digest drifted')
  }
  const manifest = parseJson(manifestBytes, 'frozen manifest')
  const ledger = parseJson(ledgerBytes, 'frozen ledger')
  if (prefixedDigest(manifest.manifestDigest) !== manifestRef.declaredDigest) fail('manifest declared digest drifted')
  if (prefixedDigest(ledger.ledgerDigest) !== ledgerRef.declaredDigest) fail('ledger declared digest drifted')
  return { manifest, ledger }
}

function inventoryForPaper(manifest, paperId) {
  const paper = Array.isArray(manifest.papers)
    ? manifest.papers.find((item) => item?.paperId === paperId)
    : null
  if (!paper || !isRecordValue(paper.latestTree) || !Array.isArray(paper.latestTree.files)) {
    fail(`frozen inventory has no latest tree for ${paperId}`)
  }
  return paper
}

function documentForRole(capture, role) {
  const documents = capture.documents.filter((document) => sameStrings(document?.roles, [role]))
  if (documents.length !== 1) fail(`capture must have exactly one ${role} document`)
  return documents[0]
}

function validateNestedDocument({ capture, expected, inventoryPaper }) {
  const document = documentForRole(capture, expected.role)
  if (
    document.inputKey !== expected.inputKey
    || document.sha256 !== expected.sha256
    || document.byteLength !== expected.byteLength
    || document.mediaType !== 'application/json'
    || document.originalName !== basename(expected.path)
  ) {
    fail(`${expected.paperId} ${expected.role} capture metadata does not match the committed batch`)
  }
  const inventoryFile = inventoryPaper.latestTree.files.find((file) => file?.path === expected.path)
  if (
    !inventoryFile
    || inventoryFile.role !== expected.role
    || prefixedDigest(inventoryFile.sha256) !== expected.sha256
    || inventoryFile.byteLength !== expected.byteLength
  ) {
    fail(`${expected.paperId} ${expected.role} is not bound to the frozen inventory`)
  }
  const bytes = decodeBase64(document.encodedBytes, `${expected.paperId} ${expected.role}`)
  if (sha256(bytes) !== expected.sha256 || bytes.byteLength !== expected.byteLength) {
    fail(`${expected.paperId} ${expected.role} nested bytes do not match their digest binding`)
  }
  const committedBytes = repositoryFile(expected.path)
  if (!sameBytes(bytes, committedBytes)) {
    fail(`${expected.paperId} ${expected.role} nested bytes do not match the committed frozen document`)
  }
  const expectedArtifactId = stableId('source-document', { sha256: expected.sha256 })
  const expectedDocumentId = stableId('document', {
    digest: expected.sha256,
    roles: [expected.role],
    inputKey: expected.inputKey,
  })
  if (
    !isRecordValue(document.immutableArtifactRef)
    || document.immutableArtifactRef.artifactId !== expectedArtifactId
    || document.immutableArtifactRef.sha256 !== expected.sha256
    || document.immutableArtifactRef.byteLength !== expected.byteLength
    || document.documentId !== expectedDocumentId
  ) {
    fail(`${expected.paperId} ${expected.role} immutable artifact identity drifted`)
  }
  return { ...document, role: expected.role, bytes, value: parseJson(bytes, `${expected.paperId} ${expected.role}`) }
}

function validateMaterializedDocumentShapes(record) {
  const asset = record.documents.find((document) => document.role === 'asset-projection').value
  const meta = record.documents.find((document) => document.role === 'source-provenance').value
  const answers = record.documents.find((document) => document.role === 'official-answer-lead').value
  if (
    asset.schemaVersion !== 'paper-asset-v1'
    || meta.schemaVersion !== 'import-meta-v1'
    || answers.schemaVersion !== 'answer-key-v1'
    || asset.paper?.paperId !== record.paperId
    || meta.paperId !== record.paperId
    || answers.paperId !== record.paperId
    || asset.paper?.assetVersion !== answers.sourceAssetVersion
    || !isRecordValue(asset.content)
    || !isRecordValue(asset.content.groups)
    || !isRecordValue(asset.content.questions)
    || !isRecordValue(asset.content.blanks)
    || (asset.content.writingTasks !== undefined && !isRecordValue(asset.content.writingTasks))
    || !isRecordValue(answers.answers)
  ) {
    fail(`${record.paperId} does not expose the stable legacy JSON fields required for structural projection`)
  }
  if (isRecordValue(asset.answerKey) && isRecordValue(asset.answerKey.answers) && digestJson(asset.answerKey.answers) !== digestJson(answers.answers)) {
    fail(`${record.paperId} embedded asset answers disagree with the frozen official answer key`)
  }
}

function buildTrustedRegistry() {
  const batchBytes = repositoryFile(batchRelativePath)
  const batch = parseJson(batchBytes, 'Ticket 26 batch evidence')
  if (
    batch.schemaVersion !== 'ticket-26-source-materialization-v1'
    || batch.materializerVersion !== 'ticket-26-source-materialization-v1'
    || digestJson(withoutKey(batch, 'batchDigest')) !== batch.batchDigest
    || !Array.isArray(batch.papers)
    || !isRecordValue(batch.membership)
    || batch.membership.frozenPaperCount !== 33
    || batch.membership.materializedPaperCount !== 31
    || !sameStrings(batch.membership.excludedPaperIds, ['paper-2025-i', 'paper-2026-i'])
    || !sameStrings(batch.membership.paperIds, batch.papers.map((paper) => paper?.paperId))
  ) {
    fail('batch identity, membership, or digest drifted')
  }
  if (new Set(batch.membership.paperIds).size !== 31) fail('batch paper membership is not unique')
  const { manifest } = validateSourceAuthority(batch)
  const byCaptureDigest = new Map()
  for (const batchPaper of batch.papers) {
    if (!isRecordValue(batchPaper) || typeof batchPaper.paperId !== 'string' || !Array.isArray(batchPaper.sourceDocuments) || !isRecordValue(batchPaper.capture)) {
      fail('batch paper entry is malformed')
    }
    const capturePath = `test-fixtures/paper-import/paper-canonical-source-captures/ticket-26-v1/${batchPaper.paperId}/source-capture-v1.json`
    if (batchPaper.capture.path !== capturePath) fail(`${batchPaper.paperId} capture path is not its committed identity path`)
    if (!sameStrings(batchPaper.sourceDocuments.map((document) => document?.role), expectedRoles)) {
      fail(`${batchPaper.paperId} source document roles are not the exact Ticket 26 set`)
    }
    const rawCaptureBytes = repositoryFile(capturePath)
    const capture = parseJson(rawCaptureBytes, `${batchPaper.paperId} source capture`)
    const base = captureBase(capture)
    if (
      capture.schemaVersion !== 'source-capture-v1'
      || capture.captureId !== stableId('source-capture', base)
      || capture.digest !== digestJson(base)
      || capture.captureId !== batchPaper.capture.captureId
      || capture.digest !== batchPaper.capture.digest
    ) {
      fail(`${batchPaper.paperId} exact capture identity drifted`)
    }
    const inventoryPaper = inventoryForPaper(manifest, batchPaper.paperId)
    const documents = batchPaper.sourceDocuments.map((expected) => validateNestedDocument({
      capture,
      expected: { ...expected, paperId: batchPaper.paperId },
      inventoryPaper,
    }))
    const record = {
      paperId: batchPaper.paperId,
      capture: { ...batchPaper.capture },
      captureBytes: rawCaptureBytes,
      captureValue: capture,
      documents,
    }
    validateMaterializedDocumentShapes(record)
    const captureDigest = sha256(rawCaptureBytes)
    if (byCaptureDigest.has(captureDigest)) fail(`${batchPaper.paperId} capture bytes duplicate another paper`)
    byCaptureDigest.set(captureDigest, record)
  }
  return byCaptureDigest
}

function registry() {
  if (!trustedRegistry) trustedRegistry = buildTrustedRegistry()
  return trustedRegistry
}

/**
 * Resolve identity exclusively from an exact committed capture byte sequence.
 * No caller-provided paper id, path, role, or nested source document is read.
 */
export function resolveTicket26LegacySourceCapture(sourceCaptureBytes) {
  if (!(sourceCaptureBytes instanceof Uint8Array) || sourceCaptureBytes.byteLength === 0) return null
  const record = registry().get(sha256(sourceCaptureBytes))
  return record && sameBytes(sourceCaptureBytes, record.captureBytes) ? record : null
}

function orderedAssetGroups(asset) {
  const layoutGroupIds = asset.layoutTree?.parts
    ?.flatMap((part) => part?.sections || [])
    .flatMap((section) => section?.groups || [])
    .map((group) => group?.groupId)
  if (!Array.isArray(layoutGroupIds) || layoutGroupIds.length === 0 || new Set(layoutGroupIds).size !== layoutGroupIds.length) {
    fail(`${asset.paper.paperId} layoutTree does not provide an exact ordered group list`)
  }
  const groups = layoutGroupIds.map((groupId) => asset.content.groups[groupId])
  if (groups.some((group) => !isRecordValue(group)) || Object.keys(asset.content.groups).length !== groups.length) {
    fail(`${asset.paper.paperId} layoutTree and content.groups do not close over the same groups`)
  }
  return groups
}

function profileForStructuralShape(groups, writingTasks) {
  const readingCount = groups.filter((group) => group.groupType === 'reading').length
  const seven = groups.filter((group) => group.groupType === 'sevenChoices')
  const cloze = groups.filter((group) => group.groupType === 'cloze')
  const grammar = groups.filter((group) => group.groupType === 'grammarFill')
  const taskTypes = groups
    .filter((group) => group.groupType === 'writing')
    .map((group) => writingTasks[group.writingTaskId]?.taskType)
    .sort()
  const commonObjectiveShape = seven.length === 1
    && seven[0].questionIds?.length === 5
    && seven[0].blankIds?.length === 5
    && cloze.length === 1
    && grammar.length === 1
    && grammar[0].questionIds?.length === 10
    && grammar[0].blankIds?.length === 10
  if (commonObjectiveShape && readingCount === 4 && cloze[0].questionIds?.length === 15 && sameStrings(taskTypes, ['application', 'continuation'])) return 'nck1'
  if (commonObjectiveShape && readingCount === 4 && cloze[0].questionIds?.length === 20 && taskTypes.length === 0) return 'national-legacy'
  if (commonObjectiveShape && readingCount === 3 && cloze[0].questionIds?.length === 20 && sameStrings(taskTypes, ['application', 'continuation'])) return 'zhejiang-legacy'
  fail('legacy structural shape does not select one supported profile')
}

function structuralSlot(group, readingIndex, writingTasks) {
  if (group.groupType === 'reading') {
    const slot = ['reading.a', 'reading.b', 'reading.c', 'reading.d'][readingIndex]
    if (!slot) fail(`${group.groupId} exceeds the shared reading slot shape`)
    return { slotId: slot, family: 'reading' }
  }
  if (group.groupType === 'sevenChoices') return { slotId: 'reading.seven-choices', family: 'seven-choices' }
  if (group.groupType === 'cloze') return { slotId: 'language.cloze', family: 'cloze' }
  if (group.groupType === 'grammarFill') return { slotId: 'language.grammar-fill', family: 'grammar-fill' }
  if (group.groupType === 'writing') {
    const task = writingTasks[group.writingTaskId]
    if (!isRecordValue(task)) fail(`${group.groupId} has no stable writingTask`)
    if (task.taskType === 'application') return { slotId: 'writing.application', family: 'application-writing', writingTask: task }
    if (task.taskType === 'continuation') return { slotId: 'writing.continuation', family: 'continuation-writing', writingTask: task }
  }
  fail(`${group.groupId} has no supported structural source type`)
}

function sourceSpanId(record, role) {
  const document = record.documents.find((item) => item.role === role)
  const observation = record.captureValue.observations
    ?.find((item) => item?.value?.role === role && item.kind === 'immutable_source_document')
  if (!document || !observation?.sourceSpanId) fail(`${record.paperId} lacks a ${role} source span`)
  return observation.sourceSpanId
}

function inactiveSlotsForSource(profileId, assetSpanId) {
  const authority = resolveCanonicalAuthority(trustedLegacyCaptureCandidateAuthorityRef)
  const profile = authority.ok ? authority.closure.profiles.get(profileId) : null
  if (!profile) fail(`${profileId} is not available in the trusted legacy authority`)
  return Object.fromEntries(slotsForProfile(profile)
    .filter((slot) => slot.activation === 'inactive_source')
    .map((slot) => [
      slot.slotId,
      profile.completeness.requireInactiveSourceClosure === false
        && slot.sourceClosureContractRef
        ? 'not_supplied'
        : [assetSpanId],
    ]))
}

function textContent(nodeId, text) {
  return [{ kind: 'text', nodeId, text: String(text || '') }]
}

function blankIdsByQuestionNumber(questionIds, blankIds, questions) {
  if (
    !Array.isArray(questionIds)
    || !Array.isArray(blankIds)
    || questionIds.length !== blankIds.length
    || questions.length !== questionIds.length
  ) return new Map()
  const byQuestionNumber = new Map()
  const seenBlankIds = new Set()
  for (const [index, questionId] of questionIds.entries()) {
    const question = questions[index]
    const blankId = blankIds[index]
    if (
      !isRecordValue(question)
      || question.questionId !== questionId
      || !Number.isInteger(question.questionNo)
      || typeof blankId !== 'string'
      || seenBlankIds.has(blankId)
      || byQuestionNumber.has(question.questionNo)
    ) return new Map()
    seenBlankIds.add(blankId)
    byQuestionNumber.set(question.questionNo, blankId)
  }
  return byQuestionNumber
}

function markerInlines(paragraphId, text, blankIdByQuestionNumber, promptByBlankId) {
  const literal = String(text || '')
  const markers = [...literal.matchAll(/__(\d+)__/g)]
  if (markers.length === 0 || blankIdByQuestionNumber.size === 0) {
    return textContent(`text:${paragraphId}`, literal)
  }
  const inlines = []
  let cursor = 0
  for (const [markerIndex, marker] of markers.entries()) {
    if (marker.index > cursor) {
      inlines.push({
        kind: 'text',
        nodeId: `text:${paragraphId}:${cursor}`,
        text: literal.slice(cursor, marker.index),
      })
    }
    const blankId = blankIdByQuestionNumber.get(Number(marker[1]))
    inlines.push(blankId
      ? { kind: 'blank_ref', nodeId: `blank-ref:${paragraphId}:${marker.index}`, blankId }
      : {
          kind: 'text',
          nodeId: `text:${paragraphId}:${marker.index}`,
          text: marker[0],
        })
    cursor = marker.index + marker[0].length
    const prompt = blankId && promptByBlankId.get(blankId)
    const promptPrefix = typeof prompt === 'string' && prompt.length > 0
      ? ` (${prompt})`
      : null
    const nextMarkerIndex = markers[markerIndex + 1]?.index ?? literal.length
    const promptBoundary = promptPrefix
      ? literal.slice(cursor + promptPrefix.length, cursor + promptPrefix.length + 1)
      : ''
    if (
      promptPrefix
      && literal.slice(cursor, nextMarkerIndex).startsWith(promptPrefix)
      && /\s/u.test(promptBoundary)
      && ![' ', '\t'].includes(promptBoundary)
    ) {
      // Keep the exact frozen text, but make a source-owned prompt its own
      // immediate inline sibling when an exact non-ASCII source whitespace
      // boundary would otherwise be invisible to the shared grammar contract.
      inlines.push({
        kind: 'text',
        nodeId: `text:${paragraphId}:${cursor}:prompt`,
        text: promptPrefix,
      })
      cursor += promptPrefix.length
    }
  }
  if (cursor < literal.length) {
    inlines.push({
      kind: 'text',
      nodeId: `text:${paragraphId}:${cursor}`,
      text: literal.slice(cursor),
    })
  }
  return inlines
}

function passageContent(group, questionIds = [], blankIds = [], questions = [], blanks = {}) {
  const blankIdByQuestionNumber = blankIdsByQuestionNumber(questionIds, blankIds, questions)
  const promptByBlankId = new Map(blankIds.flatMap((blankId) => {
    const prompt = blanks[blankId]?.prompt
    return typeof prompt === 'string' && prompt.length > 0 ? [[blankId, prompt]] : []
  }))
  return {
    blocks: (group.passage?.paragraphs || []).map((paragraph, index) => ({
      kind: 'paragraph',
      nodeId: paragraph.paragraphId || `paragraph:${group.groupId}:${index + 1}`,
      inlines: markerInlines(
        paragraph.paragraphId || `paragraph:${group.groupId}:${index + 1}`,
        paragraph.text,
        blankIdByQuestionNumber,
        promptByBlankId,
      ),
    })),
  }
}

function writingContent(group, writingTask) {
  const content = passageContent(group)
  if (writingTask?.taskType !== 'continuation') return content
  return {
    blocks: [
      ...content.blocks,
      ...(Array.isArray(writingTask.continuationStarters)
        ? writingTask.continuationStarters.map((starter, index) => ({
            kind: 'paragraph',
            nodeId: `paragraph:${group.groupId}:starter:${index + 1}`,
            inlines: textContent(`text:${group.groupId}:starter:${index + 1}`, starter),
          }))
        : []),
    ],
  }
}

function optionSet(groupId, question) {
  return {
    questionId: question.questionId,
    options: (question.options || []).map((option) => ({
      optionId: `option:${question.questionId}:${option.label}`,
      label: option.label,
      content: textContent(`text:${groupId}:${question.questionId}:option:${option.label}`, option.text),
    })),
  }
}

function choiceOwnership(group, family, questions) {
  if (family === 'seven-choices') {
    return {
      ownership: 'shared_bank',
      bankId: `bank:${group.groupId}`,
      options: (group.optionBank || []).map((option) => ({
        optionId: `option:${option.label}`,
        label: option.label,
        content: textContent(`text:${group.groupId}:option:${option.label}`, option.text),
      })),
    }
  }
  if (family === 'reading' || family === 'cloze') {
    return { ownership: 'per_question', sets: questions.map((question) => optionSet(group.groupId, question)) }
  }
  return { ownership: 'none' }
}

function answerByQuestionId(answerKey) {
  return new Map(Object.values(answerKey.answers).map((answer) => [answer.questionId, answer.answer]))
}

function promptBinding(blank, blankId, observationId) {
  if (typeof blank?.prompt === 'string' && blank.prompt.length > 0) {
    return {
      blankId,
      provision: 'source_prompt',
      prompt: blank.prompt,
      authorityObservationRef: observationId,
    }
  }
  return { blankId, provision: 'source_proven_none', authorityObservationRef: observationId }
}

function legacyWritingObservationId(paperId, groupId, suffix) {
  return `observation:ticket-26:${paperId}:${groupId}:${suffix}`
}

function completeBlockRef(block) {
  if (!block || !Array.isArray(block.inlines) || block.inlines.length === 0) return null
  return {
    blockId: block.nodeId,
    inlineNodeIds: block.inlines.map((inline) => inline.nodeId),
  }
}

function sourceRefContaining(content, target) {
  const targetText = String(target)
  for (const block of content.blocks || []) {
    const inlineNodeIds = (block.inlines || [])
      .filter((inline) => inline?.kind === 'text' && inline.text.includes(targetText))
      .map((inline) => inline.nodeId)
    if (inlineNodeIds.length > 0) return { blockId: block.nodeId, inlineNodeIds }
  }
  return completeBlockRef(content.blocks?.[0])
}

function applicationWritingVariant({ group, writingTask, content, paperId }) {
  const promptBlockRefs = (content.blocks || []).map((block) => block.nodeId)
  const promptRef = completeBlockRef(content.blocks?.[0])
  const wordCountSourceRef = sourceRefContaining(content, writingTask.wordCountTarget)
  return {
    family: 'application-writing',
    writingTaskId: writingTask.writingTaskId,
    promptBlockRefs,
    situation: {
      writerRole: promptRef,
      audienceOrDestination: promptRef,
      deliverable: promptRef,
      communicativePurpose: promptRef,
    },
    contentRequirements: [{
      requirementId: `requirement:${group.groupId}:1`,
      contentRef: promptRef,
    }],
    wordCountRuling: {
      kind: 'approximate_target',
      target: writingTask.wordCountTarget,
      countScope: 'student_authored_only',
      sourceRef: wordCountSourceRef,
      authorityObservationRef: legacyWritingObservationId(paperId, group.groupId, 'word-count'),
    },
    givenSkeleton: {
      presence: 'none',
      answerRegionAbsenceAssertionRef: legacyWritingObservationId(paperId, group.groupId, 'answer-region-empty'),
    },
    choiceOwnership: { ownership: 'none' },
    response: {
      kind: 'group_level_written_response',
      answerRegionRef: 'writing.application-box',
      authorityObservationRef: legacyWritingObservationId(paperId, group.groupId, 'response'),
    },
  }
}

function continuationWritingVariant({ group, writingTask, content, paperId }) {
  const sourceStarters = Array.isArray(writingTask.continuationStarters)
    ? writingTask.continuationStarters
    : null
  const starterBlockRefs = sourceStarters == null
    ? []
    : sourceStarters.map((_, index) => `paragraph:${group.groupId}:starter:${index + 1}`)
  const materialBlockRefs = (content.blocks || [])
    .map((block) => block.nodeId)
    .filter((blockId) => !starterBlockRefs.includes(blockId))
  const materialBlock = (content.blocks || []).find((block) => materialBlockRefs.includes(block.nodeId))
  const sourceRef = completeBlockRef(materialBlock)
  return {
    family: 'continuation-writing',
    writingTaskId: writingTask.writingTaskId,
    materialBlockRefs,
    wordCountRuling: {
      kind: 'approximate_target',
      target: writingTask.wordCountTarget,
      countScope: 'student_authored_only',
      sourceRef,
      authorityObservationRef: legacyWritingObservationId(paperId, group.groupId, 'word-count'),
    },
    starterProvision: sourceStarters?.length === 0
      ? {
          kind: 'source_proven_none',
          absenceAssertionRef: legacyWritingObservationId(paperId, group.groupId, 'starter-absence'),
        }
      : {
          kind: 'ordered_source_starters',
          starters: (sourceStarters || []).map((_, index) => ({
            starterId: `starter:${group.groupId}:${index + 1}`,
            contentRef: starterBlockRefs[index],
            authorityObservationRef: legacyWritingObservationId(paperId, group.groupId, `starter:${index + 1}`),
          })),
        },
    choiceOwnership: { ownership: 'none' },
    response: {
      kind: 'group_level_written_response',
      answerRegionRef: 'writing.continuation-box',
      authorityObservationRef: legacyWritingObservationId(paperId, group.groupId, 'response'),
    },
  }
}

function ticket26Observations(record, asset) {
  const inputKeyByDocumentId = new Map(record.documents.map((document) => [document.documentId, document.inputKey]))
  const byteLengthByInputKey = new Map(record.documents.map((document) => [document.inputKey, document.byteLength]))
  const observations = record.captureValue.observations.map((observation) => ({
    observationId: observation.observationId,
    kind: observation.kind,
    documentInputKey: inputKeyByDocumentId.get(observation.documentId),
    value: observation.value,
    span: { start: 0, end: byteLengthByInputKey.get(inputKeyByDocumentId.get(observation.documentId)) },
    extraction: { adapterId: 'ticket-26-legacy-source-capture', version: '1' },
  }))
  const assetDocument = record.documents.find((document) => document.role === 'asset-projection')
  for (const group of Object.values(asset.content.groups)) {
    if (group?.groupType !== 'grammarFill') continue
    for (const blankId of group.blankIds || []) {
      const blank = asset.content.blanks[blankId]
      const observationId = `observation:ticket-26:${record.paperId}:grammar-fill-prompt:${blankId}`
      observations.push({
        observationId,
        kind: 'grammar_fill_prompt_provision',
        documentInputKey: assetDocument.inputKey,
        value: {
          blankId,
          provision: typeof blank?.prompt === 'string' && blank.prompt.length > 0
            ? 'source_prompt'
            : 'source_proven_none',
          ...(typeof blank?.prompt === 'string' && blank.prompt.length > 0 ? { prompt: blank.prompt } : {}),
        },
        span: { start: 0, end: assetDocument.byteLength },
        extraction: { adapterId: 'ticket-26-legacy-source-capture', version: '1' },
      })
    }
  }
  for (const group of Object.values(asset.content.groups)) {
    if (group?.groupType !== 'writing') continue
    const writingTask = asset.content.writingTasks?.[group.writingTaskId]
    if (!isRecordValue(writingTask)) continue
    if (writingTask.taskType === 'application') {
      observations.push(
        {
          observationId: legacyWritingObservationId(record.paperId, group.groupId, 'answer-region-empty'),
          kind: 'application_answer_region_absence',
          documentInputKey: assetDocument.inputKey,
          value: { groupId: group.groupId, answerRegionRef: 'writing.application-box' },
          span: { start: 0, end: assetDocument.byteLength },
          extraction: { adapterId: 'ticket-26-legacy-source-capture', version: '1' },
        },
        {
          observationId: legacyWritingObservationId(record.paperId, group.groupId, 'word-count'),
          kind: 'application_word_count_ruling',
          documentInputKey: assetDocument.inputKey,
          value: {
            groupId: group.groupId,
            target: writingTask.wordCountTarget,
            countScope: 'student_authored_only',
          },
          span: { start: 0, end: assetDocument.byteLength },
          extraction: { adapterId: 'ticket-26-legacy-source-capture', version: '1' },
        },
        {
          observationId: legacyWritingObservationId(record.paperId, group.groupId, 'response'),
          kind: 'application_response_binding',
          documentInputKey: assetDocument.inputKey,
          value: {
            groupId: group.groupId,
            writingTaskId: writingTask.writingTaskId,
            answerRegionRef: 'writing.application-box',
          },
          span: { start: 0, end: assetDocument.byteLength },
          extraction: { adapterId: 'ticket-26-legacy-source-capture', version: '1' },
        },
      )
    }
    if (writingTask.taskType === 'continuation') {
      observations.push({
        observationId: legacyWritingObservationId(record.paperId, group.groupId, 'word-count'),
        kind: 'continuation_word_count_ruling',
        documentInputKey: assetDocument.inputKey,
        value: {
          groupId: group.groupId,
          target: writingTask.wordCountTarget,
          countScope: 'student_authored_only',
        },
        span: { start: 0, end: assetDocument.byteLength },
        extraction: { adapterId: 'ticket-26-legacy-source-capture', version: '1' },
      })
      if (Array.isArray(writingTask.continuationStarters)) {
        if (writingTask.continuationStarters.length === 0) {
          observations.push({
            observationId: legacyWritingObservationId(record.paperId, group.groupId, 'starter-absence'),
            kind: 'continuation_starter_absence',
            documentInputKey: assetDocument.inputKey,
            value: { groupId: group.groupId, answerRegionRef: 'writing.continuation-box' },
            span: { start: 0, end: assetDocument.byteLength },
            extraction: { adapterId: 'ticket-26-legacy-source-capture', version: '1' },
          })
        } else {
          observations.push(...writingTask.continuationStarters.map((_, index) => ({
            observationId: legacyWritingObservationId(record.paperId, group.groupId, `starter:${index + 1}`),
            kind: 'continuation_source_starter',
            documentInputKey: assetDocument.inputKey,
            value: {
              groupId: group.groupId,
              starterId: `starter:${group.groupId}:${index + 1}`,
              contentRef: `paragraph:${group.groupId}:starter:${index + 1}`,
            },
            span: { start: 0, end: assetDocument.byteLength },
            extraction: { adapterId: 'ticket-26-legacy-source-capture', version: '1' },
          })))
        }
      }
      observations.push({
        observationId: legacyWritingObservationId(record.paperId, group.groupId, 'response'),
        kind: 'continuation_response_binding',
        documentInputKey: assetDocument.inputKey,
        value: {
          groupId: group.groupId,
          writingTaskId: writingTask.writingTaskId,
          answerRegionRef: 'writing.continuation-box',
        },
        span: { start: 0, end: assetDocument.byteLength },
        extraction: { adapterId: 'ticket-26-legacy-source-capture', version: '1' },
      })
    }
  }
  return observations
}

function structuralVariant({ group, slot, questionIds, blankIds, questions, answerById, asset, content }) {
  const ownership = choiceOwnership(group, slot.family, questions)
  if (slot.family === 'reading') {
    return {
      family: 'reading',
      passageBlockRoles: [],
      questions: questions.map((question) => ({
        questionId: question.questionId,
        stem: textContent(`text:${question.questionId}:stem`, question.stem),
        correctOptionId: `option:${question.questionId}:${answerById.get(question.questionId)}`,
      })),
      choiceOwnership: ownership,
    }
  }
  if (slot.family === 'seven-choices') {
    return {
      family: 'seven-choices',
      choiceOwnership: ownership,
      members: questionIds.map((questionId, index) => ({
        questionId,
        blankId: blankIds[index],
        answer: {
          optionId: `option:${answerById.get(questionId)}`,
          authorityAssertionRef: `answer:${questionId}`,
        },
      })),
    }
  }
  if (slot.family === 'grammar-fill') {
    return {
      family: 'grammar-fill',
      choiceOwnership: ownership,
      promptBindings: blankIds.map((blankId) => promptBinding(
        asset.content.blanks[blankId],
        blankId,
        `observation:ticket-26:${asset.paper.paperId}:grammar-fill-prompt:${blankId}`,
      )),
    }
  }
  if (slot.family === 'application-writing') {
    return applicationWritingVariant({
      group,
      writingTask: slot.writingTask,
      content,
      paperId: asset.paper.paperId,
    })
  }
  if (slot.family === 'continuation-writing') {
    return continuationWritingVariant({
      group,
      writingTask: slot.writingTask,
      content,
      paperId: asset.paper.paperId,
    })
  }
  return { family: slot.family, choiceOwnership: ownership }
}

/**
 * Project only fields that already have stable names in paper-asset-v1,
 * import-meta-v1, and answer-key-v1. This is intentionally structural: it
 * performs no title, prompt, marker, or family-content heuristic.
 */
export function deriveTicket26LegacySource(sourceCaptureBytes) {
  const record = resolveTicket26LegacySourceCapture(sourceCaptureBytes)
  if (!record) throw new Error('Ticket 26 legacy source capture is not trusted')
  const asset = record.documents.find((document) => document.role === 'asset-projection').value
  const meta = record.documents.find((document) => document.role === 'source-provenance').value
  const answerKey = record.documents.find((document) => document.role === 'official-answer-lead').value
  const groups = orderedAssetGroups(asset)
  const writingTasks = asset.content.writingTasks || {}
  const profileId = profileForStructuralShape(groups, writingTasks)
  const answersByQuestionId = answerByQuestionId(answerKey)
  let readingIndex = 0
  const assetSpanId = sourceSpanId(record, 'asset-projection')
  const answerSpanId = sourceSpanId(record, 'official-answer-lead')
  const projectedGroups = groups.map((group) => {
    const slot = structuralSlot(group, readingIndex, writingTasks)
    if (group.groupType === 'reading') readingIndex += 1
    const questionIds = Array.isArray(group.questionIds) ? [...group.questionIds] : []
    const blankIds = Array.isArray(group.blankIds) ? [...group.blankIds] : []
    if (questionIds.some((questionId) => !isRecordValue(asset.content.questions[questionId]))) {
      fail(`${record.paperId} ${group.groupId} references a missing stable question`)
    }
    const questions = questionIds.map((questionId) => asset.content.questions[questionId])
    const content = slot.writingTask
      ? writingContent(group, slot.writingTask)
      : passageContent(group, questionIds, blankIds, questions, asset.content.blanks)
    const sourceSpanRefsByTarget = {
      ...Object.fromEntries(blankIds.map((blankId) => [`blank:${blankId}`, [assetSpanId]])),
      ...(slot.family === 'grammar-fill'
        ? Object.fromEntries(blankIds.map((blankId) => [
            `prompt_provision:${blankId}`,
            [`source-span:observation:ticket-26:${record.paperId}:grammar-fill-prompt:${blankId}`],
          ]))
        : {}),
    }
    return {
      groupId: group.groupId,
      slotId: slot.slotId,
      family: slot.family,
      questionIds,
      blankIds,
      sourceSpanId: assetSpanId,
      content,
      media: [],
      variant: structuralVariant({
        group,
        slot,
        questionIds,
        blankIds,
        questions,
        answerById: answersByQuestionId,
        asset,
        content,
      }),
      sourceSpanRefsByTarget,
      passage: group.passage || null,
      questions,
      blanks: blankIds.flatMap((blankId) => isRecordValue(asset.content.blanks[blankId])
        ? [asset.content.blanks[blankId]]
        : []),
      optionBank: group.optionBank || [],
      writingTask: slot.writingTask || null,
    }
  })
  const assertions = Object.values(answerKey.answers)
    .slice()
    .sort((left, right) => left.questionNo - right.questionNo)
    .map((answer) => ({
      assertionId: `answer:${answer.questionId}`,
      questionId: answer.questionId,
      answer: answer.answer,
      authority: 'official',
      sourceSpanId: answerSpanId,
    }))
  return {
    paperId: record.paperId,
    profileId,
    sourceAssetVersion: asset.paper.assetVersion,
    provenance: {
      sourceFileName: meta.sourceFileName,
      sourceFileSha256: meta.sourceFileSha256,
      paper: meta.paper,
    },
    capture: {
      captureId: record.capture.captureId,
      digest: record.capture.digest,
    },
    observations: ticket26Observations(record, asset),
    assertions,
    groups: projectedGroups,
    transformations: [],
    // The complete frozen asset is the source-owned closure for profiles that
    // require evidence of absent, suppressed slots. NCK1 keeps its existing
    // explicit not-supplied branch because that Profile does not require the
    // listening raw-closure contract for this migration Source.
    inactiveSlots: inactiveSlotsForSource(profileId, assetSpanId),
    inactiveSourceClosures: [],
  }
}

const compilerRolesByCaptureRole = {
  'asset-projection': ['question_source', 'structured_source'],
  'source-provenance': ['source_provenance'],
  'official-answer-lead': ['official_answer_source'],
}

function sameRoleSet(left, right) {
  return sameStrings([...left].sort(), [...right].sort())
}

/**
 * Re-open the capture at the compiler boundary. The envelope carries only a
 * byte binding; source semantics are always re-derived from the committed
 * capture registry.
 */
export function inspectTicket26LegacyEnvelopeSource(sourceCaptureBytes) {
  const record = resolveTicket26LegacySourceCapture(sourceCaptureBytes)
  if (!record) return { ok: false, record: null, source: null }
  return { ok: true, record, source: deriveTicket26LegacySource(record.captureBytes) }
}

/**
 * Verify that the compiler request contains the exact three frozen documents
 * selected by the trusted capture, not look-alike caller-supplied JSON.
 */
export function ticket26LegacyCompilerDocumentsMatch(record, documents) {
  if (documents.length !== record.documents.length + 2) return false
  const captureDocuments = documents.filter((document) => document.inputKey === 'ticket_26_source_capture')
  if (
    captureDocuments.length !== 1
    || captureDocuments[0].mediaType !== TICKET_26_LEGACY_CAPTURE_MEDIA_TYPE
    || !sameRoleSet(captureDocuments[0].roles, ['source_provenance'])
    || !sameBytes(captureDocuments[0].bytes, record.captureBytes)
  ) return false
  return record.documents.every((expected) => {
    const matches = documents.filter((document) => document.inputKey === expected.inputKey)
    return matches.length === 1
      && matches[0].mediaType === expected.mediaType
      && sameRoleSet(matches[0].roles, compilerRolesByCaptureRole[expected.role])
      && sameBytes(matches[0].bytes, expected.bytes)
  })
}

/**
 * Build the sole internal compiler request for a trusted legacy capture. No
 * paper id, nested path, profile, group, question, or answer crosses this
 * boundary from the caller.
 */
export function buildTicket26LegacyCompilerRequest(sourceCaptureBytes) {
  const record = resolveTicket26LegacySourceCapture(sourceCaptureBytes)
  if (!record) throw new Error('Ticket 26 legacy source capture is not trusted')
  const sourceCaptureDocument = {
    inputKey: 'ticket_26_source_capture',
    mediaType: TICKET_26_LEGACY_CAPTURE_MEDIA_TYPE,
    sha256: sha256(record.captureBytes),
    byteLength: record.captureBytes.byteLength,
  }
  return {
    evidence: {
      documents: [
        ...record.documents.map((document) => ({
          inputKey: document.inputKey,
          roles: compilerRolesByCaptureRole[document.role],
          bytes: new Uint8Array(document.bytes),
          declared: { mediaType: document.mediaType, originalName: document.originalName },
        })),
        {
          inputKey: sourceCaptureDocument.inputKey,
          roles: ['source_provenance'],
          bytes: new Uint8Array(record.captureBytes),
          declared: {
            mediaType: sourceCaptureDocument.mediaType,
            originalName: 'source-capture-v1.json',
          },
        },
        {
          inputKey: 'ticket_26_legacy_source_envelope',
          roles: ['operator_assertions'],
          bytes: textEncoder.encode(JSON.stringify({
            schemaVersion: 'ticket-26-legacy-source-envelope-v1',
            sourceCaptureDocument,
          })),
          declared: {
            mediaType: TICKET_26_LEGACY_SOURCE_ENVELOPE_MEDIA_TYPE,
            originalName: 'ticket-26-legacy-source-envelope.json',
          },
        },
      ],
    },
  }
}
