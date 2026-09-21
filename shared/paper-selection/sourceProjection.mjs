import {
  projectCanonicalConsumerGroup,
  selectedFamilyContractIdForGroup,
} from '../paper-canonical/consumerProjection.mjs'
import { digestJson } from '../paper-canonical/stable.mjs'
import {
  MAX_CONTEXT_UTF16,
  MAX_SEGMENTS,
  MAX_SELECTED_UTF16,
  SOURCE_PROJECTION_VERSION,
} from './constants.mjs'
import { buildAdjacentContext } from './segmentation.mjs'
import { assertHalfOpenUtf16Range, sliceUtf16 } from './utf16.mjs'

function formatCanonicalBlankVisibleText(questionNo, hint) {
  return `${questionNo}${hint ? `(${hint})` : ''}`
}

function textOfInlines(inlines) {
  if (!Array.isArray(inlines)) return ''
  return inlines
    .filter((inline) => inline?.kind === 'text' && typeof inline.text === 'string')
    .map((inline) => inline.text)
    .join('')
}

function paragraphVisibleText(paragraph) {
  if (typeof paragraph?.text === 'string') return paragraph.text
  if (!Array.isArray(paragraph?.nodes)) return ''
  return paragraph.nodes.map((node) => {
    if (node?.type === 'text') return node.text || ''
    if (node?.type === 'blank') {
      return formatCanonicalBlankVisibleText(node.questionNo, node.hint)
    }
    return ''
  }).join('')
}

function pushStream(streams, stream) {
  if (!stream.text) return
  streams.push({
    ...stream,
    length: stream.text.length,
  })
}

function flushBody(streams, buffer) {
  if (buffer.leaves.length === 0) return
  const text = buffer.leaves.map((leaf) => leaf.text).join('\n')
  let offset = 0
  const leaves = buffer.leaves.map((leaf, index) => {
    const start = offset
    const end = start + leaf.text.length
    offset = end + (index === buffer.leaves.length - 1 ? 0 : 1)
    return {
      kind: leaf.kind,
      id: leaf.id,
      start,
      end,
    }
  })
  pushStream(streams, {
    streamId: buffer.streamId,
    text,
    role: buffer.role,
    groupId: buffer.groupId,
    flow: true,
    leaves,
  })
  buffer.leaves = []
}

function startBodyBuffer(groupId, streamId, role) {
  return { groupId, streamId, role, leaves: [] }
}

function appendBodyParagraph(buffer, paragraph, streams) {
  const text = paragraphVisibleText(paragraph)
  if (!text) return
  const id = paragraph.paragraphId || paragraph.nodeId
  if (buffer.leaves.length > 0 && buffer.leaves[0].kind !== 'paragraph') {
    flushBody(streams, buffer)
  }
  buffer.leaves.push({ kind: 'paragraph', id, text })
}

function addInstructionStreams(streams, consumption) {
  const seen = new Set()
  for (const item of consumption.visibleStructure || []) {
    if (item?.kind !== 'instruction') continue
    if (item.renderPolicy !== 'render') continue
    if (typeof item.text !== 'string' || !item.text) continue
    if (typeof item.instructionId !== 'string') continue
    if (seen.has(item.instructionId)) continue
    seen.add(item.instructionId)
    pushStream(streams, {
      streamId: `instruction/${item.instructionId}`,
      text: item.text,
      role: 'instruction',
      groupId: null,
      flow: false,
      leaves: [{ kind: 'instruction', id: item.instructionId, start: 0, end: item.text.length }],
    })
  }
}

function addReadingBlocks(streams, groupId, blocks) {
  let body = startBodyBuffer(groupId, `${groupId}/passage/body`, 'passage-body')
  const visit = (block, { columnId } = {}) => {
    if (!block) return
    if (block.kind === 'paragraph') {
      const role = block.role && block.role !== 'body' ? block.role : 'passage-body'
      if (role !== 'passage-body' || columnId) {
        flushBody(streams, body)
        const text = typeof block.text === 'string' ? block.text : textOfInlines(block.inlines)
        if (text) {
          pushStream(streams, {
            streamId: columnId
              ? `${groupId}/column/${columnId}/paragraph/${block.nodeId}`
              : `${groupId}/paragraph/${block.nodeId}`,
            text,
            role,
            groupId,
            flow: false,
            leaves: [{ kind: 'paragraph', id: block.nodeId, start: 0, end: text.length }],
          })
        }
        return
      }
      appendBodyParagraph(body, { ...block, paragraphId: block.nodeId, nodes: undefined }, streams)
      return
    }
    if (block.kind === 'table') {
      flushBody(streams, body)
      for (const row of block.rows || []) {
        for (const cell of row.cells || []) {
          const text = typeof cell.text === 'string' ? cell.text : textOfInlines(cell.inlines)
          if (!text) continue
          pushStream(streams, {
            streamId: `${groupId}/table-cell/${cell.cellId}`,
            text,
            role: 'table-cell',
            groupId,
            flow: false,
            leaves: [{ kind: 'table-cell', id: cell.cellId, start: 0, end: text.length }],
          })
        }
      }
      return
    }
    if (block.kind === 'framed_columns') {
      flushBody(streams, body)
      for (const column of block.columns || []) {
        const columnBody = startBodyBuffer(
          groupId,
          `${groupId}/column/${column.columnId}`,
          'column',
        )
        for (const child of column.blocks || []) {
          if (child.kind === 'paragraph') {
            const text = typeof child.text === 'string' ? child.text : textOfInlines(child.inlines)
            if (text) {
              columnBody.leaves.push({ kind: 'paragraph', id: child.nodeId, text })
            }
          } else {
            flushBody(streams, columnBody)
            visit(child, { columnId: column.columnId })
          }
        }
        flushBody(streams, columnBody)
      }
      return
    }
    if (block.kind === 'figure') {
      flushBody(streams, body)
      const caption = typeof block.caption === 'string' ? block.caption : ''
      if (caption) {
        pushStream(streams, {
          streamId: `${groupId}/figure-caption/${block.nodeId}`,
          text: caption,
          role: 'figure-caption',
          groupId,
          flow: false,
          leaves: [{ kind: 'figure-caption', id: block.nodeId, start: 0, end: caption.length }],
        })
      }
    }
  }
  for (const block of blocks || []) visit(block)
  flushBody(streams, body)
}

function addBlankPassage(streams, groupId, paragraphs) {
  let body = startBodyBuffer(groupId, `${groupId}/passage/body`, 'passage-body')
  for (const paragraph of paragraphs || []) {
    const role = paragraph.role && paragraph.role !== 'body' ? paragraph.role : 'passage-body'
    if (role !== 'passage-body') {
      flushBody(streams, body)
      const text = paragraphVisibleText(paragraph)
      if (text) {
        pushStream(streams, {
          streamId: `${groupId}/paragraph/${paragraph.paragraphId}`,
          text,
          role,
          groupId,
          flow: false,
          leaves: [{
            kind: 'paragraph',
            id: paragraph.paragraphId,
            start: 0,
            end: text.length,
          }],
        })
      }
      continue
    }
    appendBodyParagraph(body, paragraph, streams)
  }
  flushBody(streams, body)
}

function addQuestionStreams(streams, groupId, questions, { skipEmptyStem = true } = {}) {
  for (const question of questions || []) {
    if (question.stem && (!skipEmptyStem || question.stem.trim())) {
      pushStream(streams, {
        streamId: `${groupId}/question/${question.questionId}/stem`,
        text: question.stem,
        role: 'question-stem',
        groupId,
        flow: false,
        leaves: [{
          kind: 'question-stem',
          id: question.questionId,
          start: 0,
          end: question.stem.length,
        }],
      })
    }
    for (const option of question.options || []) {
      if (!option.text) continue
      pushStream(streams, {
        streamId: `${groupId}/question/${question.questionId}/option/${option.label}`,
        text: option.text,
        role: 'option',
        groupId,
        flow: false,
        leaves: [{
          kind: 'option',
          id: `${question.questionId}:${option.label}`,
          start: 0,
          end: option.text.length,
        }],
      })
    }
  }
}

function addWritingBlocks(streams, groupId, blocks, role) {
  let body = startBodyBuffer(groupId, `${groupId}/${role}`, role)
  for (const block of blocks || []) {
    if (block?.kind && block.kind !== 'paragraph') {
      flushBody(streams, body)
      continue
    }
    const text = typeof block.text === 'string' ? block.text : textOfInlines(block.inlines)
    const id = block.nodeId || block.paragraphId
    if (!text || !id) continue
    body.leaves.push({ kind: 'paragraph', id, text })
  }
  flushBody(streams, body)
}

function streamsFromProjectedGroup(group) {
  const streams = []
  const groupId = group.groupId
  if (group.groupType === 'reading' || group.familyContractId === 'reading') {
    addReadingBlocks(streams, groupId, group.blocks)
    addQuestionStreams(streams, groupId, group.questions)
    return streams
  }
  if (group.groupType === 'listening' || group.familyContractId === 'listening') {
    addQuestionStreams(streams, groupId, group.questions, { skipEmptyStem: false })
    return streams
  }
  if (
    group.groupType === 'writing'
    || group.familyContractId === 'application-writing'
    || group.familyContractId === 'continuation-writing'
    || group.groupType === 'continuation'
  ) {
    addWritingBlocks(
      streams,
      groupId,
      group.promptBlocks || group.canonicalPromptBlocks || group.prompt?.blocks || [],
      'writing-prompt',
    )
    addWritingBlocks(
      streams,
      groupId,
      group.materialBlocks
        || group.canonicalContinuationMaterialBlocks
        || group.continuationMaterial?.blocks
        || [],
      'writing-material',
    )
    if (Array.isArray(group.content?.blocks)) {
      addWritingBlocks(streams, groupId, group.content.blocks, 'writing-content')
    }
    return streams
  }
  addBlankPassage(streams, groupId, group.paragraphs || group.passage?.paragraphs || [])
  addQuestionStreams(streams, groupId, group.questions)
  if (group.optionBank?.options) {
    for (const option of group.optionBank.options) {
      if (!option.text) continue
      pushStream(streams, {
        streamId: `${groupId}/option-bank/${option.label}`,
        text: option.text,
        role: 'option-bank',
        groupId,
        flow: false,
        leaves: [{
          kind: 'option-bank',
          id: option.label,
          start: 0,
          end: option.text.length,
        }],
      })
    }
  }
  return streams
}

export function computeSourceRevision(consumption) {
  return digestJson({
    paperId: consumption.paperId,
    publicationDigest: consumption.publicationDigest || null,
    sourceAssetDigest: consumption.sourceAssetDigest || null,
    visibleStructureDigest: consumption.visibleStructureDigest || null,
    sourceProjectionVersion: SOURCE_PROJECTION_VERSION,
  })
}

export function buildSelectionSourceFromConsumption(consumption) {
  if (!consumption || consumption.disposition !== 'ready' || typeof consumption.paperId !== 'string') {
    const error = new Error('Canonical consumption is not ready')
    error.code = 'SELECTION_SOURCE_UNAVAILABLE'
    throw error
  }
  const streams = []
  addInstructionStreams(streams, consumption)
  const groupIds = []
  for (const item of consumption.visibleStructure || []) {
    if (item?.kind === 'group' && typeof item.groupId === 'string') groupIds.push(item.groupId)
  }
  if (groupIds.length === 0) {
    for (const selection of consumption.selections || []) {
      for (const groupId of selection.groupIds || []) groupIds.push(groupId)
    }
  }
  for (const groupId of groupIds) {
    try {
      const familyContractId = selectedFamilyContractIdForGroup({
        consumption,
        groupId,
      })
      const projected = projectCanonicalConsumerGroup({
        consumption,
        familyContractId,
        groupId,
      })
      streams.push(...streamsFromProjectedGroup({ ...projected, groupId }))
    } catch {
      // A group that cannot be projected is omitted; it cannot be translated.
    }
  }
  return Object.freeze({
    paperId: consumption.paperId,
    sourceRevision: computeSourceRevision(consumption),
    sourceProjectionVersion: SOURCE_PROJECTION_VERSION,
    streams: Object.freeze(streams.map((stream) => Object.freeze(stream))),
  })
}

export function findStream(source, streamId) {
  return source.streams.find((stream) => stream.streamId === streamId) || null
}

export function readSelection(source, { streamId, start, end, selectedText }) {
  const stream = findStream(source, streamId)
  if (!stream) {
    const error = new Error('Unknown selection stream')
    error.code = 'SELECTION_SOURCE_MISMATCH'
    throw error
  }
  assertHalfOpenUtf16Range(stream.text, start, end, 'selection')
  const actual = sliceUtf16(stream.text, start, end)
  if (actual !== selectedText) {
    const error = new Error('selectedText does not match the source range')
    error.code = 'SELECTION_SOURCE_MISMATCH'
    throw error
  }
  return { stream, selectedText: actual }
}

export function validateTranslateSegments(source, segments) {
  if (!Array.isArray(segments) || segments.length === 0) {
    const error = new Error('At least one selection segment is required')
    error.code = 'SELECTION_REQUEST_INVALID'
    throw error
  }
  if (segments.length > MAX_SEGMENTS) {
    const error = new Error('Too many selection segments')
    error.code = 'SELECTION_LIMIT'
    throw error
  }
  let selectedUnits = 0
  const contextSeen = new Set()
  let contextUnits = 0
  const prepared = []
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    if (
      !segment
      || typeof segment.streamId !== 'string'
      || typeof segment.selectedText !== 'string'
      || !Number.isInteger(segment.start)
      || !Number.isInteger(segment.end)
    ) {
      const error = new Error('Selection segment is malformed')
      error.code = 'SELECTION_REQUEST_INVALID'
      throw error
    }
    if (segment.selectedText.length === 0 || segment.end === segment.start) {
      const error = new Error('Selection is empty')
      error.code = 'SELECTION_REQUEST_INVALID'
      throw error
    }
    const { stream } = readSelection(source, segment)
    selectedUnits += segment.selectedText.length
    const adjacent = buildAdjacentContext(stream.text, segment.start, segment.end)
    if (!contextSeen.has(adjacent.contextText)) {
      contextSeen.add(adjacent.contextText)
      contextUnits += adjacent.contextText.length
    }
    prepared.push({
      segmentIndex: index,
      streamId: stream.streamId,
      groupId: stream.groupId,
      role: stream.role,
      start: segment.start,
      end: segment.end,
      selectedText: segment.selectedText,
      adjacent,
      boundaryRoles: [stream.role],
    })
  }
  if (selectedUnits > MAX_SELECTED_UTF16 || contextUnits > MAX_CONTEXT_UTF16) {
    const error = new Error('Selection exceeds the character limit')
    error.code = 'SELECTION_LIMIT'
    throw error
  }
  return prepared
}

export { streamsFromProjectedGroup }
