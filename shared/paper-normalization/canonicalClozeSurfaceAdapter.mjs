import { segmentPaperText } from '../papersurface/segmentPaperText.mjs'
import { normalizePaperGroup } from './normalizePaperGroup.mjs'

const PROOF_PAPER_ID = 'paper-2026-i'
const PROOF_GROUP_ID = 'group-2026-i-cloze'
const CLOZE_SECTION = '完形填空'

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

function displayTextForNode(node, questionNoById) {
  if (node.type === 'text') return node.text
  const questionNo = questionNoById.get(node.questionId)
  if (questionNo === undefined) {
    throw new Error(`Canonical blank references missing question ${node.questionId}`)
  }
  return `${questionNo}${node.hint ? ` (${node.hint})` : ''}`
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
        section: CLOZE_SECTION,
        sentences: segmented.sentences,
      },
      semanticParagraph: {
        id: paragraph.paragraphId,
        section: CLOZE_SECTION,
        groupType: canonicalGroup.groupType,
        sentences: semanticSentences,
      },
    }
  })
}

/**
 * Compatibility adapter for the single Ticket 02 proof group.
 *
 * It returns a discriminated result so hosts can retain their legacy model
 * when compatibility is not enabled or normalization fails closed.
 */
export function buildCanonicalClozeSurfaceData({ asset, groupId }) {
  if (asset?.paper?.paperId !== PROOF_PAPER_ID || groupId !== PROOF_GROUP_ID) {
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
          section: CLOZE_SECTION,
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
