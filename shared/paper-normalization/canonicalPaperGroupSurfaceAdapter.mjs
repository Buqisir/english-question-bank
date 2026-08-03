import { segmentPaperText } from '../papersurface/segmentPaperText.mjs'
import { translateAbcdPlanToPointPlacement } from '../paper-canonical/abcdLayout.mjs'
import {
  projectCanonicalConsumerGroup,
  projectCanonicalWritingChrome,
} from '../paper-canonical/consumerProjection.mjs'
import { buildExactPaperGroupSourceSlice } from './exactPaperGroupSourceSlice.mjs'
import { normalizePaperGroup } from './normalizePaperGroup.mjs'

const COMPATIBILITY_GROUPS = new Set([
  'paper-2026-i:group-2026-i-cloze',
  'paper-2026-i:group-2026-i-grammar-fill',
  'paper-960d0f8d:group-960d0f8d-grammar-fill',
])
const SECTION_BY_GROUP_TYPE = Object.freeze({
  cloze: '完形填空',
  grammarFill: '语法填空',
  sevenChoices: '七选五',
})

function compatibilityDiagnostic(asset, groupId) {
  return {
    code: 'CANONICAL_COMPATIBILITY_NOT_ENABLED',
    paperId: asset?.paper?.paperId ?? '',
    groupId,
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

  const normalized = normalizePaperGroup(
    buildExactPaperGroupSourceSlice(asset, groupId),
  )
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

/**
 * Canonical-required Screen adapter. Unlike the historical compatibility
 * adapter above, this accepts only the whole-paper loader result and never
 * reparses source fields or falls back after selection.
 */
export function buildCanonicalConsumptionSurfaceData({
  consumption,
  familyContractId,
  groupId,
}) {
  const canonicalGroup = projectCanonicalConsumerGroup({
    consumption,
    familyContractId,
    groupId,
  })
  const paragraphModels = buildParagraphModels(canonicalGroup)
  return {
    status: 'ready',
    semanticDigest: canonicalGroup.semanticSignature,
    ...(canonicalGroup.occurrenceSignature
      ? { occurrenceSignature: canonicalGroup.occurrenceSignature }
      : {}),
    ...(canonicalGroup.questionBlankPairs
      ? { questionBlankPairs: canonicalGroup.questionBlankPairs }
      : {}),
    ...(canonicalGroup.optionBank
      ? { optionBank: canonicalGroup.optionBank }
      : {}),
    placementSignatures: canonicalGroup.questions.map(
      (question) => question.placementSignature,
    ),
    surfaceData: {
      textMap: {
        paperId: canonicalGroup.paperId,
        paragraphs: paragraphModels.map((model) => model.textMapParagraph),
      },
      semanticParagraphs: paragraphModels.map(
        (model) => model.semanticParagraph,
      ),
      questions: canonicalGroup.questions.map((question, order) => {
        const placement = question.layoutPlan
          ? translateAbcdPlanToPointPlacement(question.layoutPlan)
          : null
        return {
          id: question.questionId,
          section: SECTION_BY_GROUP_TYPE[canonicalGroup.groupType],
          order,
          questionNo: String(question.questionNo),
          stem: question.stem,
          options: question.options.map((option) => ({
            label: option.label,
            text: option.text,
          })),
          ...(placement
            ? {
                canonicalPlacement: {
                  mode: placement.mode,
                  signature: placement.placementSignature,
                  rowWidthPt: placement.rowWidthPt,
                  columnStartsPt: placement.columnStartsPt,
                  columnWidthsPt: placement.columnWidthsPt,
                },
              }
            : {}),
        }
      }),
      evidence: [],
    },
  }
}

/**
 * Canonical-required Reading Screen adapter.
 *
 * Rich blocks stay ordered and typed instead of being flattened into the
 * TextMap. Paragraphs still populate the TextMap as the immutable addressing
 * oracle for optional Analysis overlays.
 */
export function buildCanonicalReadingConsumptionSurfaceData({
  consumption,
  groupId,
}) {
  const canonicalGroup = projectCanonicalConsumerGroup({
    consumption,
    familyContractId: 'reading',
    groupId,
  })
  const textMapParagraphs = canonicalGroup.blocks
    .filter((block) => block.kind === 'paragraph')
    .map((block) => {
      const segmented = segmentPaperText(block.text, {
        sectionId: block.nodeId,
      }).paragraphs[0]
      if (!segmented) {
        throw new Error(
          `Canonical Reading paragraph ${block.nodeId} has no visible text`,
        )
      }
      return {
        id: block.nodeId,
        section: canonicalGroup.groupId,
        sentences: segmented.sentences,
      }
    })
  return {
    status: 'ready',
    semanticDigest: canonicalGroup.semanticSignature,
    passageLetter: canonicalGroup.passageLetter,
    placementSignatures: canonicalGroup.questions.map(
      (question) => question.placementSignature,
    ),
    richBlocks: canonicalGroup.blocks,
    anchors: canonicalGroup.anchors,
    surfaceData: {
      textMap: {
        paperId: canonicalGroup.paperId,
        paragraphs: textMapParagraphs,
      },
      questions: canonicalGroup.questions.map((question, order) => {
        const placement = translateAbcdPlanToPointPlacement(
          question.layoutPlan,
        )
        return {
          id: question.questionId,
          section: '__global__',
          order,
          questionNo: String(question.questionNo),
          stem: question.stem,
          canonicalStemContent: question.stemContent,
          options: question.options.map((option) => ({
            label: option.label,
            text: option.text,
            canonicalContent: option.content,
          })),
          canonicalIdentity: {
            questionId: question.questionId,
            optionIds: question.options.map((option) => option.optionId),
          },
          canonicalPlacement: {
            mode: placement.mode,
            signature: placement.placementSignature,
            questionStemStartPt: placement.questionStemStartPt,
            rowWidthPt: placement.rowWidthPt,
            columnStartsPt: placement.columnStartsPt,
            columnWidthsPt: placement.columnWidthsPt,
            placements: placement.placements.map((item) => ({
              optionId: item.optionId,
              label: item.label,
              row: item.row,
              column: item.column,
              startPt: item.startPt,
              continuationStartPt: item.continuationStartPt,
            })),
          },
        }
      }),
      evidence: [],
    },
  }
}

/**
 * Canonical-required Application Writing Screen adapter.
 *
 * Prompt and fixed text come only from the closed occurrence. The historical
 * Paper Asset writing scaffold extractor is intentionally outside this seam.
 */
export function buildCanonicalApplicationWritingConsumptionSurfaceData({
  consumption,
  groupId,
  renderedGroupIds,
}) {
  const canonicalGroup = projectCanonicalConsumerGroup({
    consumption,
    familyContractId: 'application-writing',
    groupId,
  })
  const sourceBlocks = canonicalGroup.writingMode === 'legacy_opaque'
    ? canonicalGroup.sourceBlocks
    : canonicalGroup.promptBlocks
  const sourceOwnedInstructions = canonicalGroup.writingMode === 'legacy_opaque'
    ? canonicalGroup.sourceOwnedInstructions || []
    : []
  const promptBlocks = [
    ...sourceBlocks,
    ...sourceOwnedInstructions.map((instruction) => ({
      nodeId: `source-instruction:${instruction.sourceBlockIndex}`,
      text: instruction.text,
      inlines: [{
        kind: 'text',
        nodeId: `source-instruction:${instruction.sourceBlockIndex}:text`,
        text: instruction.text,
      }],
    })),
  ]
  const paragraphs = promptBlocks.map((block) => {
    const segmented = segmentPaperText(block.text, {
      sectionId: block.nodeId,
    }).paragraphs[0]
    if (!segmented) {
      throw new Error(
        `Canonical Application Writing prompt ${block.nodeId} has no visible text`,
      )
    }
    return {
      id: block.nodeId,
      section: canonicalGroup.groupId,
      sentences: segmented.sentences,
    }
  })
  const answerBox = {
    kind: 'answerBox',
    label: canonicalGroup.writingMode === 'legacy_opaque' ? '写作答题区' : '应用文写作答题区',
    answerRegionRef: canonicalGroup.answerRegion.answerRegionRef,
    responseSlotId: canonicalGroup.answerRegion.responseSlotId,
    ...(canonicalGroup.writingMode === 'legacy_opaque'
      ? { ownership: canonicalGroup.answerRegion.ownership }
      : {}),
    semanticSignature: canonicalGroup.semanticSignature,
    occurrenceSignature: canonicalGroup.occurrenceSignature,
    givenTop: canonicalGroup.answerRegion.givenTop || [],
    givenBottom: canonicalGroup.answerRegion.givenBottom || [],
  }
  const writingChrome = projectCanonicalWritingChrome({
    consumption,
    groupId,
    renderedGroupIds,
  })
  return {
    status: 'ready',
    semanticDigest: canonicalGroup.semanticSignature,
    occurrenceSignature: canonicalGroup.occurrenceSignature,
    answerRegion: canonicalGroup.answerRegion,
    anchors: canonicalGroup.anchors,
    ...(canonicalGroup.writingMode === 'legacy_opaque'
      ? { writingMode: canonicalGroup.writingMode }
      : {}),
    promptBlocks,
    pageModel: {
      blocks: [
        ...(writingChrome.part
          ? [{
              kind: 'partHeading',
              instructionId: writingChrome.part.instructionId,
              text: writingChrome.part.text,
            }]
          : []),
        ...(writingChrome.section
          ? [{
              kind: 'sectionHeading',
              instructionId: writingChrome.section.instructionId,
              text: writingChrome.section.text,
            }]
          : []),
        ...writingChrome.instructions.map((instruction) => ({
          kind: 'instruction',
          instructionId: instruction.instructionId,
          text: instruction.text,
        })),
        { kind: 'passage' },
        answerBox,
      ],
    },
    surfaceData: {
      textMap: {
        paperId: canonicalGroup.paperId,
        paragraphs,
      },
      questions: [],
      evidence: [],
    },
  }
}

/**
 * Canonical-required Continuation Writing Screen adapter.
 *
 * Material and starter lines are projected from the closed occurrence. This
 * seam never reads the legacy Writing Task arrays or parses paragraph labels.
 */
export function buildCanonicalContinuationWritingConsumptionSurfaceData({
  consumption,
  groupId,
  renderedGroupIds,
}) {
  const canonicalGroup = projectCanonicalConsumerGroup({
    consumption,
    familyContractId: 'continuation-writing',
    groupId,
  })
  const sourceBlocks = canonicalGroup.writingMode === 'legacy_opaque'
    ? canonicalGroup.sourceBlocks
    : canonicalGroup.materialBlocks
  const starterLines = canonicalGroup.writingMode === 'legacy_opaque'
    ? canonicalGroup.sourceStarterBlockRefs.map((contentRef) => {
        const block = sourceBlocks.find((candidate) => candidate.nodeId === contentRef)
        if (!block) {
          throw new Error(
            `Canonical Continuation Writing starter ${contentRef} is absent from source blocks`,
          )
        }
        return {
          starterId: contentRef,
          contentRef,
          authorityObservationRef: canonicalGroup.occurrenceSignature,
          text: block.text,
          inlines: block.inlines,
        }
      })
    : canonicalGroup.answerRegion.starterLines
  const paragraphs = sourceBlocks.map((block) => {
    const segmented = segmentPaperText(block.text, {
      sectionId: block.nodeId,
    }).paragraphs[0]
    if (!segmented) {
      throw new Error(
        `Canonical Continuation Writing material ${block.nodeId} has no visible text`,
      )
    }
    return {
      id: block.nodeId,
      section: canonicalGroup.groupId,
      sentences: segmented.sentences,
    }
  })
  const answerBox = {
    kind: 'answerBox',
    label: canonicalGroup.writingMode === 'legacy_opaque' ? '写作答题区' : '读后续写答题区',
    answerRegionRef: canonicalGroup.answerRegion.answerRegionRef,
    responseSlotId: canonicalGroup.answerRegion.responseSlotId,
    ...(canonicalGroup.writingMode === 'legacy_opaque'
      ? { ownership: canonicalGroup.answerRegion.ownership }
      : {}),
    semanticSignature: canonicalGroup.semanticSignature,
    occurrenceSignature: canonicalGroup.occurrenceSignature,
    givenTop: starterLines || [],
    givenBottom: [],
  }
  const writingChrome = projectCanonicalWritingChrome({
    consumption,
    groupId,
    renderedGroupIds,
  })
  return {
    status: 'ready',
    semanticDigest: canonicalGroup.semanticSignature,
    occurrenceSignature: canonicalGroup.occurrenceSignature,
    answerRegion: canonicalGroup.answerRegion,
    anchors: canonicalGroup.anchors,
    ...(canonicalGroup.writingMode === 'legacy_opaque'
      ? { writingMode: canonicalGroup.writingMode }
      : {}),
    materialBlocks: sourceBlocks,
    wordCountRuling: canonicalGroup.wordCountRuling,
    ...(canonicalGroup.writingMode === 'legacy_opaque'
      ? {
          wordCountTarget: canonicalGroup.wordCountTarget,
          wordCountTargetCertainty: canonicalGroup.wordCountTargetCertainty,
          wordCountScope: canonicalGroup.wordCountScope,
        }
      : {}),
    pageModel: {
      blocks: [
        ...(writingChrome.part
          ? [{
              kind: 'partHeading',
              instructionId: writingChrome.part.instructionId,
              text: writingChrome.part.text,
            }]
          : []),
        ...(writingChrome.section
          ? [{
              kind: 'sectionHeading',
              instructionId: writingChrome.section.instructionId,
              text: writingChrome.section.text,
            }]
          : []),
        ...writingChrome.instructions.map((instruction) => ({
          kind: 'instruction',
          instructionId: instruction.instructionId,
          text: instruction.text,
        })),
        { kind: 'passage' },
        answerBox,
      ],
    },
    surfaceData: {
      textMap: {
        paperId: canonicalGroup.paperId,
        paragraphs,
      },
      questions: [],
      evidence: [],
    },
  }
}
