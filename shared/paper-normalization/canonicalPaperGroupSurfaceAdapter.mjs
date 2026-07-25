import { segmentPaperText } from '../papersurface/segmentPaperText.mjs'
import { normalizePaperGroup } from './normalizePaperGroup.mjs'

const COMPATIBILITY_GROUPS = new Set([
  'paper-2026-i:group-2026-i-cloze',
  'paper-2026-i:group-2026-i-grammar-fill',
  'paper-960d0f8d:group-960d0f8d-grammar-fill',
])
const SECTION_BY_GROUP_TYPE = Object.freeze({
  cloze: '完形填空',
  grammarFill: '语法填空',
})

function compatibilityDiagnostic(asset, groupId) {
  return {
    code: 'CANONICAL_COMPATIBILITY_NOT_ENABLED',
    paperId: asset?.paper?.paperId ?? '',
    groupId,
  }
}

function exactSourceSlice(asset, groupId) {
  const group = asset?.content?.groups?.[groupId]
  const questionIds = Array.isArray(group?.questionIds) ? group.questionIds : []
  const blankIds = Array.isArray(group?.blankIds) ? group.blankIds : []
  return {
    paperId: asset?.paper?.paperId,
    sourceAssetVersion: asset?.paper?.assetVersion,
    group,
    questions: Object.fromEntries(
      questionIds
        .filter((questionId) => asset?.content?.questions?.[questionId] !== undefined)
        .map((questionId) => [questionId, asset.content.questions[questionId]]),
    ),
    blanks: Object.fromEntries(
      blankIds
        .filter((blankId) => asset?.content?.blanks?.[blankId] !== undefined)
        .map((blankId) => [blankId, asset.content.blanks[blankId]]),
    ),
  }
}

export function formatCanonicalBlankVisibleText(questionNo, hint) {
  return `${questionNo}${hint ? `(${hint})` : ''}`
}

function displayTextForNode(node, questionNoById) {
  if (node.type === 'text') return node.text
  const questionNo = questionNoById.get(node.questionId)
  if (questionNo === undefined) {
    throw new Error(`Canonical blank references missing question ${node.questionId}`)
  }
  return formatCanonicalBlankVisibleText(questionNo, node.hint)
}

function sliceSemanticNodes(displaySegments, start, end) {
  const nodes = []
  for (const segment of displaySegments) {
    const overlapStart = Math.max(start, segment.start)
    const overlapEnd = Math.min(end, segment.end)
    if (overlapStart >= overlapEnd) continue
    if (segment.node.type === 'blank') {
      if (overlapStart !== segment.start || overlapEnd !== segment.end) {
        throw new Error(`Sentence boundary splits canonical blank ${segment.node.blankId}`)
      }
      nodes.push(segment.node)
      continue
    }
    nodes.push({
      type: 'text',
      text: segment.visibleText.slice(
        overlapStart - segment.start,
        overlapEnd - segment.start,
      ),
    })
  }
  return nodes
}

function buildParagraphModels(canonicalGroup) {
  const section = SECTION_BY_GROUP_TYPE[canonicalGroup.groupType]
  if (!section) {
    throw new Error(`Unsupported canonical surface group type ${canonicalGroup.groupType}`)
  }
  const questionNoById = new Map(
    canonicalGroup.questions.map((question) => [
      question.questionId,
      String(question.questionNo),
    ]),
  )

  return canonicalGroup.paragraphs.map((paragraph) => {
    let offset = 0
    const displaySegments = paragraph.nodes.map((node) => {
      const visibleText = displayTextForNode(node, questionNoById)
      const segment = {
        start: offset,
        end: offset + visibleText.length,
        visibleText,
        node:
          node.type === 'text'
            ? { type: 'text', text: node.text }
            : {
                type: 'blank',
                questionId: node.questionId,
                blankId: node.blankId,
                questionNo: questionNoById.get(node.questionId),
                hint: node.hint,
              },
      }
      offset = segment.end
      return segment
    })
    const visibleText = displaySegments.map((segment) => segment.visibleText).join('')
    const segmented = segmentPaperText(visibleText, {
      sectionId: paragraph.paragraphId,
    }).paragraphs[0]
    if (!segmented) {
      throw new Error(`Canonical paragraph ${paragraph.paragraphId} has no visible text`)
    }

    let searchFrom = 0
    const semanticSentences = segmented.sentences.map((sentence) => {
      const start = visibleText.indexOf(sentence.text, searchFrom)
      if (start < 0) {
        throw new Error(`Cannot align canonical sentence ${sentence.id}`)
      }
      const end = start + sentence.text.length
      searchFrom = end
      return {
        id: sentence.id,
        nodes: sliceSemanticNodes(displaySegments, start, end),
      }
    })

    return {
      textMapParagraph: {
        id: paragraph.paragraphId,
        section,
        sentences: segmented.sentences,
      },
      semanticParagraph: {
        id: paragraph.paragraphId,
        section,
        groupType: canonicalGroup.groupType,
        sentences: semanticSentences,
      },
    }
  })
}

/**
 * Compatibility adapter for the explicitly allowlisted proof groups.
 *
 * It returns a discriminated result so hosts can retain their legacy model
 * when compatibility is not enabled or normalization fails closed.
 */
export function buildCanonicalPaperGroupSurfaceData({ asset, groupId }) {
  const paperId = asset?.paper?.paperId ?? ''
  if (!COMPATIBILITY_GROUPS.has(`${paperId}:${groupId}`)) {
    return {
      status: 'not_enabled',
      diagnostic: compatibilityDiagnostic(asset, groupId),
    }
  }

  const normalized = normalizePaperGroup(exactSourceSlice(asset, groupId))
  if (normalized.status === 'needs_review') {
    return {
      status: 'needs_review',
      issues: normalized.issues,
      diagnostic: {
        code: 'CANONICAL_NORMALIZATION_NEEDS_REVIEW',
        paperId: asset.paper.paperId,
        groupId,
        issues: normalized.issues,
      },
    }
  }

  try {
    const paragraphModels = buildParagraphModels(normalized.group)
    return {
      status: 'ready',
      semanticDigest: normalized.semanticDigest,
      surfaceData: {
        textMap: {
          paperId: asset.paper.paperId,
          paragraphs: paragraphModels.map((model) => model.textMapParagraph),
        },
        semanticParagraphs: paragraphModels.map((model) => model.semanticParagraph),
        questions: normalized.group.questions.map((question, order) => ({
          id: question.questionId,
          section: SECTION_BY_GROUP_TYPE[normalized.group.groupType],
          order,
          questionNo: String(question.questionNo),
          stem: question.stem ?? '',
          options: question.options,
        })),
        evidence: [],
      },
    }
  } catch (error) {
    const issues = [
      {
        code: 'CANONICAL_VALIDATION_FAILED',
        path: 'group.paragraphs',
        message: error instanceof Error ? error.message : String(error),
      },
    ]
    return {
      status: 'needs_review',
      issues,
      diagnostic: {
        code: 'CANONICAL_NORMALIZATION_NEEDS_REVIEW',
        paperId: asset.paper.paperId,
        groupId,
        issues,
      },
    }
  }
}

/**
 * Ticket 02 compatibility name retained for existing cloze consumers.
 */
export function buildCanonicalClozeSurfaceData(input) {
  return buildCanonicalPaperGroupSurfaceData(input)
}
