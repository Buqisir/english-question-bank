import {
  adaptiveAbcdLayoutRules,
  abcdPlacementSignature,
  layoutAbcdOptionSet,
  layoutAbcdOptionGroup,
  layoutFixedFourColumnClozeOptionSet,
  layoutListeningOptionSet,
} from './abcdLayout.mjs'
import { authorityAdmitsApplicationDrawingArea, closureAdmitsReadingStemFigures, authorityAdmitsApplicationPromptFigures, resolveCanonicalAuthority } from './authority.mjs'
import { isBase64String } from './base64.mjs'
import { consumerRendersApplicationDrawingArea, consumerRendersReadingStemFigures, consumerRendersApplicationPromptFigures } from './consumers.mjs'
import { grammarFillPromptPrefix } from './grammarFillPromptContract.mjs'
import { validateMediaPresentation } from './mediaPresentation.mjs'
import { resolvePassageBlockRoles } from './passageBlockRoles.mjs'
import { readingPassageLetterBySlotId } from './readingPassageLetter.mjs'
import { digestJson, sha256, stableStringify } from './stable.mjs'
import { validateReadingFigureLayout } from './readingFigureLayout.mjs'
import { validCanonicalSourcePresentation } from './sourcePresentation.mjs'

const SUPPORTED_FAMILIES = new Set([
  'cloze',
  'grammar-fill',
  'seven-choices',
  'reading',
  'application-writing',
  'continuation-writing',
  'listening',
])

const VERIFIED_PRE_V18_CLOZE_CONSUMPTION_DIGESTS = new Set([
  'sha256:9088282a4eac36c568c8f57a7c643ed9e173b5b3bb04806a28074f636996268c',
])

const VERIFIED_PRE_V20_GRAMMAR_FILL_CONSUMPTION_DIGESTS = new Set([
  'sha256:9088282a4eac36c568c8f57a7c643ed9e173b5b3bb04806a28074f636996268c',
])

function rejected(message, issues = []) {
  const error = new Error(message)
  error.code = 'CANONICAL_CONSUMPTION_REJECTED'
  error.issues = issues
  return error
}

function textContent(nodes) {
  if (!Array.isArray(nodes) || nodes.some((node) => node?.kind !== 'text' || typeof node.text !== 'string')) {
    throw rejected('Canonical option content is not plain renderable text')
  }
  return nodes.map((node) => node.text).join('')
}

function projectListeningConsumerGroup(input, occurrence) {
  const { groupId } = input
  const questionOnly = ['51', '52', '54', '55', '57', '58', '59', '61', '62', '64', '66', '67', '68', '69', '71', '73', '74'].includes(input.consumption.authorityRef?.manifestVersion)
  if (
    !Array.isArray(occurrence.blanks)
    || occurrence.blanks.length !== 0
    || !Array.isArray(occurrence.numbering)
    || !Array.isArray(occurrence.questions)
    || !Array.isArray(occurrence.transcriptSegments)
    || (occurrence.firstSectionPlayback !== undefined
      && !['once_explicit', 'twice_default'].includes(occurrence.firstSectionPlayback))
    || occurrence.questions.length !== occurrence.numbering.length
    || occurrence.choices?.ownership !== 'per_question'
    || !Array.isArray(occurrence.choices.sets)
    || occurrence.choices.sets.length !== occurrence.questions.length
  ) {
    throw rejected(`Canonical Listening occurrence ${groupId} is incomplete`)
  }
  const questions = occurrence.questions.map((question, index) => {
    const numbering = occurrence.numbering[index]
    const choiceSet = occurrence.choices.sets[index]
    if (
      question?.questionId !== numbering?.questionId
      || question.number !== numbering.number
      || choiceSet?.questionId !== question.questionId
      || !Array.isArray(question.stem)
      || !Array.isArray(question.options)
      || question.options.length !== 3
      || question.options.map((option) => option?.label).join('') !== 'ABC'
      || choiceSet.options?.map((option) => option?.optionId).join(',')
        !== question.options.map((option) => option?.optionId).join(',')
      || (questionOnly
        ? Object.hasOwn(question, 'correctOptionId')
        : !question.options.some((option) => option.optionId === question.correctOptionId))
    ) {
      throw rejected(`Canonical Listening occurrence ${groupId} has an invalid A-C Question`)
    }
    const options = question.options.map((option) => ({
      optionId: option.optionId,
      label: option.label,
      text: textContent(option.content),
      content: structuredClone(option.content),
    }))
    const layoutPlan = layoutListeningOptionSet({ owner: 'question', options })
    if (layoutPlan.status !== 'selected') {
      throw rejected(`Canonical Listening occurrence ${groupId} has unrenderable A-C choices`)
    }
    return {
      questionId: question.questionId,
      questionNo: question.number,
      stem: textContent(question.stem),
      stemContent: structuredClone(question.stem),
      options,
      layoutPlan,
    }
  })
  const coveredQuestionIds = occurrence.transcriptSegments.flatMap((segment) => {
    if (
      typeof segment?.segmentId !== 'string'
      || (questionOnly
        ? Object.hasOwn(segment, 'content')
        : !Array.isArray(segment.content) || textContent(segment.content).length === 0)
      || !Array.isArray(segment.questionIds)
    ) throw rejected(`Canonical Listening occurrence ${groupId} has an invalid transcript`)
    return segment.questionIds
  })
  if (
    occurrence.transcriptSegments.length !== 5
    || coveredQuestionIds.join(',') !== questions.map(({ questionId }) => questionId).join(',')
    || occurrence.anchors?.questionIds?.join(',')
      !== questions.map(({ questionId }) => questionId).join(',')
    || occurrence.anchors?.optionIds?.join(',')
      !== questions.flatMap((question) =>
        question.options.map(({ optionId }) => optionId)).join(',')
    || occurrence.anchors?.transcriptSegmentIds?.join(',')
      !== occurrence.transcriptSegments.map(({ segmentId }) => segmentId).join(',')
  ) throw rejected(`Canonical Listening occurrence ${groupId} has invalid anchors`)

  const semantic = {
    paperId: input.consumption.paperId,
    groupId,
    familyContractId: 'listening',
    questions: questions.map(({ layoutPlan: _layoutPlan, ...question }) => question),
    ...(occurrence.sourcePresentation === undefined ? {} : { sourcePresentation: structuredClone(occurrence.sourcePresentation) }),
  }
  return Object.freeze({
    groupType: 'listening',
    ...(occurrence.firstSectionPlayback === undefined
      ? {}
      : { firstSectionPlayback: occurrence.firstSectionPlayback }),
    segments: occurrence.transcriptSegments.map(({ segmentId, questionIds }) => ({
      segmentId,
      questionIds: structuredClone(questionIds),
    })),
    ...semantic,
    questions,
    semanticSignature: digestJson(semantic),
  })
}

function decodeBase64Bytes(value) {
  if (!isBase64String(value)) return null
  try {
    const decoded = atob(value)
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0))
  } catch {
    return null
  }
}

function projectReadingConsumerGroup(input, occurrence) {
  const { groupId } = input
  const authorityRef = input.consumption.authorityRef
  const authority = authorityRef ? resolveCanonicalAuthority(authorityRef) : null
  if (authority && !authority.ok) throw rejected('Canonical Reading placement authority is unavailable')
  const rulesetId = authority?.closure.artifacts['renderer-typography']?.schemaVersion === 'renderer-typography-v11'
    ? adaptiveAbcdLayoutRules.rulesetId : undefined
  const passageLetter = readingPassageLetterBySlotId[occurrence.slotId]
  if (
    !passageLetter
    || !Array.isArray(occurrence.blanks)
    || occurrence.blanks.length !== 0
    || !Array.isArray(occurrence.numbering)
    || !Array.isArray(occurrence.blocks)
    || digestJson(occurrence.blocks) !== digestJson(occurrence.content?.blocks)
    || !Array.isArray(occurrence.passageBlockRoles)
    || !Array.isArray(occurrence.questions)
    || !Array.isArray(occurrence.media)
  ) {
    throw rejected(`Canonical Reading occurrence ${groupId} is incomplete`)
  }

  const paragraphIds = new Set(
    occurrence.blocks
      .filter((block) => block?.kind === 'paragraph')
      .map((block) => block.nodeId),
  )
  const rolesByNodeId = new Map()
  for (const entry of occurrence.passageBlockRoles) {
    if (
      !entry
      || !paragraphIds.has(entry.nodeId)
      || !['title', 'subtitle'].includes(entry.role)
      || rolesByNodeId.has(entry.nodeId)
    ) {
      throw rejected(`Canonical Reading occurrence ${groupId} has invalid heading roles`)
    }
    rolesByNodeId.set(entry.nodeId, entry.role)
  }

  const mediaById = new Map()
  const presentationRequired = occurrence.media.some(
    (media) => media?.presentation !== undefined,
  )
  for (const media of occurrence.media) {
    if (
      !media
      || typeof media.mediaId !== 'string'
      || typeof media.sha256 !== 'string'
      || typeof media.mimeType !== 'string'
      || !Number.isInteger(media.pixelWidth)
      || !Number.isInteger(media.pixelHeight)
      || typeof media.sourceArtifactRef?.artifactId !== 'string'
      || (
        presentationRequired
        && !validateMediaPresentation(media.presentation)
      )
      || mediaById.has(media.mediaId)
    ) {
      throw rejected(`Canonical Reading occurrence ${groupId} has invalid media closure`)
    }
    mediaById.set(media.mediaId, media)
  }
  const mediaArtifactsById = new Map(
    (input.consumption.mediaArtifacts || []).map((artifact) => [
      artifact?.mediaId,
      artifact,
    ]),
  )

  const seenMediaIds = new Set()
  const resolveReadingMedia = (mediaId, context) => {
    const media = mediaById.get(mediaId)
    const artifact = mediaArtifactsById.get(mediaId)
    const mediaBytes = decodeBase64Bytes(artifact?.encodedBytes)
    if (
      !media
      || seenMediaIds.has(mediaId)
      || !artifact
      || artifact.mimeType !== media.mimeType
      || artifact.sha256 !== media.sha256
      || artifact.pixelWidth !== media.pixelWidth
      || artifact.pixelHeight !== media.pixelHeight
      || artifact.sourceArtifactRef?.artifactId !== media.sourceArtifactRef.artifactId
      || typeof artifact.encodedBytes !== 'string'
      || !mediaBytes
      || sha256(mediaBytes) !== media.sha256
    ) {
      throw rejected(`Canonical Reading occurrence ${groupId} has unresolved ${context} media`)
    }
    seenMediaIds.add(mediaId)
    return {
      media: structuredClone(media),
      mediaArtifact: structuredClone(artifact),
    }
  }
  const projectReadingParagraph = (block) => ({
    kind: 'paragraph',
    nodeId: block.nodeId,
    role: rolesByNodeId.get(block.nodeId) || 'body',
    text: textContent(block.inlines),
    inlines: structuredClone(block.inlines),
  })
  const projectReadingTable = (block) => {
    if (
      !Number.isInteger(block.columnCount)
      || block.columnCount < 1
      || !Array.isArray(block.rows)
      || block.rows.length === 0
    ) {
      throw rejected(`Canonical Reading occurrence ${groupId} has an invalid table`)
    }
    const activeRowSpans = new Map()
    const rows = block.rows.map((row) => {
      if (!row || typeof row.rowId !== 'string' || !Array.isArray(row.cells)) {
        throw rejected(`Canonical Reading occurrence ${groupId} has an invalid table row`)
      }
      const cells = row.cells.map((cell) => {
        if (
          !cell
          || typeof cell.cellId !== 'string'
          || !Number.isInteger(cell.columnStart)
          || !Number.isInteger(cell.columnSpan)
          || !Number.isInteger(cell.rowSpan)
          || cell.columnSpan < 1
          || cell.rowSpan < 1
          || cell.columnStart < 0
          || cell.columnStart + cell.columnSpan > block.columnCount
        ) {
          throw rejected(`Canonical Reading occurrence ${groupId} has an invalid table cell`)
        }
        const inlines = cell.inlines.map((inline) => {
          if (inline?.kind === 'text') return structuredClone(inline)
          if (inline?.kind !== 'media_ref' || typeof inline.alt !== 'string') {
            throw rejected(`Canonical Reading occurrence ${groupId} has an invalid table inline`)
          }
          return {
            ...structuredClone(inline),
            ...resolveReadingMedia(inline.mediaId, 'table'),
          }
        })
        return {
          ...structuredClone(cell),
          inlines,
          text: cell.inlines
            .filter((inline) => inline?.kind === 'text')
            .map((inline) => inline.text)
            .join(''),
        }
      })
      const occupied = new Set(activeRowSpans.keys())
      for (const cell of cells) {
        for (
          let column = cell.columnStart;
          column < cell.columnStart + cell.columnSpan;
          column += 1
        ) {
          if (occupied.has(column)) {
            throw rejected(`Canonical Reading occurrence ${groupId} has overlapping table cells`)
          }
          occupied.add(column)
        }
        if (cell.rowSpan > 1) {
          for (
            let column = cell.columnStart;
            column < cell.columnStart + cell.columnSpan;
            column += 1
          ) {
            activeRowSpans.set(column, cell.rowSpan - 1)
          }
        }
      }
      if (occupied.size !== block.columnCount) {
        throw rejected(`Canonical Reading occurrence ${groupId} has a non-rectangular table`)
      }
      for (const [column, remaining] of [...activeRowSpans]) {
        if (
          cells.some(
            (cell) =>
              column >= cell.columnStart
              && column < cell.columnStart + cell.columnSpan,
          )
        ) continue
        if (remaining === 1) activeRowSpans.delete(column)
        else activeRowSpans.set(column, remaining - 1)
      }
      return { rowId: row.rowId, cells }
    })
    if (activeRowSpans.size > 0) {
      throw rejected(`Canonical Reading occurrence ${groupId} has a table row span beyond its final row`)
    }
    return {
      kind: 'table',
      nodeId: block.nodeId,
      columnCount: block.columnCount,
      rows,
    }
  }
  const projectReadingChildBlock = (block, { allowFramedColumns, allowFigure }) => {
    if (!block || typeof block.nodeId !== 'string') {
      throw rejected(`Canonical Reading occurrence ${groupId} has an invalid rich block`)
    }
    if (block.kind === 'paragraph') return projectReadingParagraph(block)
    if (block.kind === 'table') return projectReadingTable(block)
    if (block.kind === 'figure') {
      if (!allowFigure) {
        throw rejected(`Canonical Reading occurrence ${groupId} contains an unsupported framed_columns child`)
      }
      const resolvedMedia = resolveReadingMedia(block.mediaId, 'Figure')
      const publicCaption = resolvedMedia.media.presentation
        ? block.caption
        : []
      return {
        kind: 'figure',
        nodeId: block.nodeId,
        mediaId: block.mediaId,
        ...resolvedMedia,
        caption: textContent(publicCaption),
        captionInlines: structuredClone(publicCaption),
      }
    }
    if (block.kind === 'framed_columns') {
      if (
        !allowFramedColumns
        || block.columnCount !== 2
        || !Array.isArray(block.columns)
        || block.columns.length !== 2
      ) {
        throw rejected(`Canonical Reading occurrence ${groupId} contains an unsupported rich block`)
      }
      return {
        kind: 'framed_columns',
        nodeId: block.nodeId,
        columnCount: 2,
        columns: block.columns.map((column) => {
          if (
            !column
            || typeof column.columnId !== 'string'
            || !Array.isArray(column.blocks)
            || column.blocks.length === 0
          ) {
            throw rejected(`Canonical Reading occurrence ${groupId} has an invalid framed_columns column`)
          }
          if (column.columnHeading != null) {
            const heading = column.blocks.find((child) => child?.nodeId === column.columnHeading)
            if (!heading || heading.kind !== 'paragraph') {
              throw rejected(`Canonical Reading occurrence ${groupId} has an invalid framed_columns heading`)
            }
          }
          return {
            columnId: column.columnId,
            ...(
              typeof column.columnHeading === 'string'
                ? { columnHeading: column.columnHeading }
                : {}
            ),
            blocks: column.blocks.map((child) => projectReadingChildBlock(child, {
              allowFramedColumns: false,
              allowFigure: false,
            })),
          }
        }),
      }
    }
    throw rejected(`Canonical Reading occurrence ${groupId} contains an unsupported rich block`)
  }
  const blocks = occurrence.blocks.map((block) => projectReadingChildBlock(block, {
    allowFramedColumns: true,
    allowFigure: true,
  }))

  const numberByQuestionId = new Map()
  for (const assignment of occurrence.numbering) {
    if (
      typeof assignment?.questionId !== 'string'
      || !Number.isInteger(assignment.number)
      || numberByQuestionId.has(assignment.questionId)
    ) {
      throw rejected(`Canonical Reading occurrence ${groupId} has invalid numbering`)
    }
    numberByQuestionId.set(assignment.questionId, assignment.number)
  }
  if (
    occurrence.questions.length !== occurrence.numbering.length
    || occurrence.questions.some(
      (question, index) =>
        question?.questionId !== occurrence.numbering[index]?.questionId
        || question.number !== occurrence.numbering[index]?.number,
    )
  ) {
    throw rejected(`Canonical Reading occurrence ${groupId} has invalid Question order`)
  }

  const textOptionSets = occurrence.questions.filter((question) =>
    Array.isArray(question.options) && !question.options.some((option) => option?.figure))
    .map((question) => ({
      owner: 'question',
      questionId: question.questionId,
      options: question.options,
    }))
  const layoutPlans = layoutAbcdOptionGroup(textOptionSets, rulesetId)
  const layoutByQuestionId = new Map(textOptionSets.map((set, index) =>
    [set.questionId, layoutPlans[index]]))
  const questions = occurrence.questions.map((question) => {
    if (question.stemFigures !== undefined && (!closureAdmitsReadingStemFigures(authority?.closure)
      || !consumerRendersReadingStemFigures(input.consumption.consumerContractRef))) {
      throw rejected(`Canonical Reading occurrence ${groupId} has no stem figure consumer capability`)
    }
    if (question.stemFigures !== undefined
      && (!Array.isArray(question.stemFigures) || question.stemFigures.length === 0)) {
      throw rejected(`Canonical Reading occurrence ${groupId} has an invalid stem figure sequence`)
    }
    const stemFigures = question.stemFigures === undefined ? {} : {
      stemFigures: question.stemFigures.map(figure => {
        if (figure?.kind !== 'figure' || !Array.isArray(figure.caption) || figure.caption.length !== 0) {
          throw rejected(`Canonical Reading occurrence ${groupId} requires a stem figure with an empty caption`)
        }
        return projectReadingChildBlock(figure, { allowFigure: true, allowFramedColumns: false })
      }),
    }
    if (
      !Array.isArray(question.stem)
      || !Array.isArray(question.options)
      || question.options.length !== 4
      || question.options.map((option) => option?.label).join('') !== 'ABCD'
      || new Set(question.options.map((option) => option?.optionId)).size !== 4
      || !question.options.some(
        (option) => option.optionId === question.correctOptionId,
      )
    ) {
      throw rejected(`Canonical Reading occurrence ${groupId} has an invalid A-D Question`)
    }
    if (question.options.some((option) => option.figure)) {
      if (!question.options.every((option) => option.figure && !option.content)) {
        throw rejected(`Canonical Reading occurrence ${groupId} mixes figure and text options`)
      }
      if (question.figureLayout && !validateReadingFigureLayout(question.figureLayout, question.questionId, question.options)) {
        throw rejected(`Canonical Reading occurrence ${groupId} has stale source geometry`)
      }
      const options = question.options.map((option) => ({
        optionId: option.optionId,
        label: option.label,
        text: '',
        figure: {
          mediaId: option.figure.mediaId,
          ...resolveReadingMedia(option.figure.mediaId, 'option'),
        },
      }))
      return {
        questionId: question.questionId,
        questionNo: numberByQuestionId.get(question.questionId),
        stem: textContent(question.stem),
        stemContent: structuredClone(question.stem),
        ...stemFigures,
        options,
        correctOptionId: question.correctOptionId,
        layoutPlan: null,
        ...(question.figureLayout ? { figureLayout: structuredClone(question.figureLayout.intent) } : {}),
        placementSignature: digestJson(options.map((option) => ({
          optionId: option.optionId, mediaId: option.figure.mediaId,
        }))),
      }
    }
    const options = question.options.map((option) => ({
      optionId: option.optionId,
      label: option.label,
      text: textContent(option.content),
      content: structuredClone(option.content),
    }))
    const layoutPlan = layoutByQuestionId.get(question.questionId)
    if (layoutPlan.status !== 'selected') {
      throw rejected(`Canonical A-D placement failed for ${question.questionId}`, [layoutPlan])
    }
    return {
      questionId: question.questionId,
      questionNo: numberByQuestionId.get(question.questionId),
      stem: textContent(question.stem),
      stemContent: structuredClone(question.stem),
      ...stemFigures,
      options,
      correctOptionId: question.correctOptionId,
      layoutPlan,
      placementSignature: abcdPlacementSignature(layoutPlan),
    }
  })
  if (seenMediaIds.size !== mediaById.size) {
    throw rejected(`Canonical Reading occurrence ${groupId} does not place every media item exactly once`)
  }

  const collectOccurrenceContentNodeIds = (block) => {
    const identities = [block.nodeId]
    if (block.kind === 'table') {
      for (const row of block.rows) {
        identities.push(row.rowId)
        for (const cell of row.cells) {
          identities.push(cell.cellId)
          identities.push(...cell.inlines.map((inline) => inline.nodeId))
        }
      }
      return identities
    }
    if (block.kind === 'framed_columns') {
      for (const column of block.columns || []) {
        identities.push(column.columnId)
        for (const child of column.blocks || []) {
          identities.push(...collectOccurrenceContentNodeIds(child))
        }
      }
      return identities
    }
    identities.push(...(
      block.kind === 'figure' ? block.caption : block.inlines
    ).map((inline) => inline.nodeId))
    return identities
  }
  const contentNodeIds = [
    ...occurrence.blocks.flatMap((block) => collectOccurrenceContentNodeIds(block)),
    ...occurrence.questions.flatMap(question =>
      (question.stemFigures || []).flatMap(collectOccurrenceContentNodeIds)),
  ]
  const anchors = occurrence.anchors
  if (
    !anchors
    || new Set(anchors.contentNodeIds).size !== contentNodeIds.length
    || contentNodeIds.some((nodeId) => !anchors.contentNodeIds.includes(nodeId))
    || anchors.questionIds?.join(',') !==
      questions.map((question) => question.questionId).join(',')
    || anchors.optionIds?.join(',') !==
      questions.flatMap(
        (question) => question.options.map((option) => option.optionId),
      ).join(',')
  ) {
    throw rejected(`Canonical Reading occurrence ${groupId} has invalid anchors`)
  }

  const semantic = {
    paperId: input.consumption.paperId,
    groupId,
    familyContractId: 'reading',
    blocks,
    questions: questions.map(
      ({ layoutPlan: _layoutPlan, placementSignature: _placementSignature, ...question }) =>
        question,
    ),
    anchors: structuredClone(occurrence.anchors),
  }
  return Object.freeze({
    groupType: 'reading',
    ...semantic,
    passageLetter,
    media: structuredClone(occurrence.media),
    questions,
    semanticSignature: digestJson(semantic),
  })
}

function projectOpaqueLegacyWritingConsumerGroup(input, occurrence, {
  familyContractId,
  groupType,
  sourceTaskType,
  answerRegionRef,
}) {
  const { groupId } = input
  if (
    occurrence.writingMode !== 'legacy_opaque'
    || occurrence.sourceTaskType !== sourceTaskType
    || typeof occurrence.paperChrome?.part?.partId !== 'string'
    || typeof occurrence.paperChrome.part.instructionId !== 'string'
    || typeof occurrence.paperChrome.part.text !== 'string'
    || !['render', 'suppress'].includes(occurrence.paperChrome.part.renderPolicy)
    || typeof occurrence.paperChrome?.section?.sectionId !== 'string'
    || typeof occurrence.paperChrome.section.instructionId !== 'string'
    || typeof occurrence.paperChrome.section.text !== 'string'
    || !['render', 'suppress'].includes(occurrence.paperChrome.section.renderPolicy)
    || !Array.isArray(occurrence.paperChrome.instructions)
    || occurrence.paperChrome.instructions.some(
      (instruction) =>
        typeof instruction?.instructionId !== 'string'
        || typeof instruction.text !== 'string'
        || typeof instruction.placement !== 'string'
        || !['render', 'suppress'].includes(instruction.renderPolicy),
    )
    || new Set([
      occurrence.paperChrome.part.instructionId,
      occurrence.paperChrome.section.instructionId,
      ...occurrence.paperChrome.instructions.map((instruction) => instruction.instructionId),
    ]).size !== occurrence.paperChrome.instructions.length + 2
    || !Array.isArray(occurrence.numbering)
    || occurrence.numbering.length !== 0
    || !Array.isArray(occurrence.blanks)
    || occurrence.blanks.length !== 0
    || occurrence.choices?.ownership !== 'none'
    || Object.keys(occurrence.choices).length !== 1
    || typeof occurrence.writingTaskId !== 'string'
    || !Array.isArray(occurrence.content?.blocks)
    || !Array.isArray(occurrence.sourceBlocks)
    || (
      input.consumption?.paperId === 'paper-2026-i'
      && input.consumption?.sourceAssetVersion === 2
      && groupId === 'group-2026-i-writing-application'
      && (
        !Array.isArray(occurrence.sourceOwnedInstructions)
        || occurrence.sourceOwnedInstructions.length !== 1
        || occurrence.sourceOwnedInstructions.some(
          (instruction) =>
            !Number.isInteger(instruction?.sourceBlockIndex)
            || typeof instruction.text !== 'string'
            || instruction.text.length === 0,
        )
      )
    )
    || !Number.isInteger(occurrence.wordCountTarget)
    || occurrence.wordCountTarget < 1
    || occurrence.wordCountTargetCertainty !== 'explicit_legacy_field'
    || occurrence.wordCountScope !== 'unspecified'
    || occurrence.answerRegion?.answerRegionRef !== answerRegionRef
    || typeof occurrence.answerRegion?.responseSlotId !== 'string'
    || occurrence.answerRegion.ownership !== 'product'
  ) {
    throw rejected(`Opaque legacy ${familyContractId} occurrence ${groupId} is incomplete`)
  }
  const contentBlocks = occurrence.content.blocks
  if (
    contentBlocks.some(
      (block) =>
        block?.kind !== 'paragraph'
        || typeof block.nodeId !== 'string'
        || !Array.isArray(block.inlines),
    )
    || new Set(contentBlocks.map((block) => block.nodeId)).size !== contentBlocks.length
    || occurrence.sourceBlocks.length !== contentBlocks.length
    || occurrence.sourceBlocks.some(
      (block, index) => digestJson(block) !== digestJson(contentBlocks[index]),
    )
  ) {
    throw rejected(`Opaque legacy ${familyContractId} occurrence ${groupId} does not preserve ordered source content`)
  }
  const sourceBlocks = contentBlocks.map((block) => ({
    nodeId: block.nodeId,
    text: textContent(block.inlines),
    inlines: structuredClone(block.inlines),
  }))
  const sourceStarterBlockRefs = sourceTaskType === 'continuation'
    ? occurrence.sourceStarterBlockRefs
    : undefined
  const sourceStarterLinesInResponse =
    input.consumption?.paperId === 'paper-2026-i'
    && ['44', '45'].includes(input.consumption?.authorityRef?.manifestVersion)
    && groupId === 'group-2026-i-writing-continuation'
  const sourceOwnedInstructions = Array.isArray(occurrence.sourceOwnedInstructions)
    ? occurrence.sourceOwnedInstructions.map((instruction) => ({
        sourceBlockIndex: instruction.sourceBlockIndex,
        text: instruction.text,
      }))
    : undefined
  if (
    sourceTaskType === 'continuation'
    && (
      !Array.isArray(sourceStarterBlockRefs)
      || new Set(sourceStarterBlockRefs).size !== sourceStarterBlockRefs.length
      || sourceStarterBlockRefs.some((blockId) => !sourceBlocks.some((block) => block.nodeId === blockId))
      || sourceStarterBlockRefs.some(
        (blockId, index) => sourceBlocks.findIndex((block) => block.nodeId === blockId)
          < (index === 0 ? 0 : sourceBlocks.findIndex((block) => block.nodeId === sourceStarterBlockRefs[index - 1])),
      )
    )
  ) {
    throw rejected(`Opaque legacy ${familyContractId} occurrence ${groupId} has invalid source starter metadata`)
  }
  const contentNodeIds = contentBlocks.flatMap((block) => [
    block.nodeId,
    ...block.inlines.map((inline) => inline.nodeId),
  ])
  if (
    !occurrence.anchors
    || new Set(occurrence.anchors.contentNodeIds).size !== contentNodeIds.length
    || contentNodeIds.some((nodeId) => !occurrence.anchors.contentNodeIds.includes(nodeId))
    || occurrence.anchors.responseSlotId !== occurrence.answerRegion.responseSlotId
  ) {
    throw rejected(`Opaque legacy ${familyContractId} occurrence ${groupId} has invalid anchors`)
  }
  const answerRegion = {
    answerRegionRef: occurrence.answerRegion.answerRegionRef,
    responseSlotId: occurrence.answerRegion.responseSlotId,
    ownership: occurrence.answerRegion.ownership,
  }
  const semantic = {
    paperId: input.consumption.paperId,
    groupId,
    familyContractId,
    writingMode: occurrence.writingMode,
    sourceTaskType,
    paperChrome: structuredClone(occurrence.paperChrome),
    writingTaskId: occurrence.writingTaskId,
    sourceBlocks,
    ...(sourceOwnedInstructions === undefined
      ? {}
      : { sourceOwnedInstructions }),
    ...(sourceStarterBlockRefs === undefined
      ? {}
      : { sourceStarterBlockRefs: structuredClone(sourceStarterBlockRefs) }),
    ...(sourceStarterLinesInResponse ? { sourceStarterLinesInResponse } : {}),
    wordCountTarget: occurrence.wordCountTarget,
    wordCountTargetCertainty: occurrence.wordCountTargetCertainty,
    wordCountScope: occurrence.wordCountScope,
    answerRegion,
    anchors: structuredClone(occurrence.anchors),
  }
  return Object.freeze({
    groupType,
    ...semantic,
    ...(sourceOwnedInstructions === undefined
      ? {}
      : { sourceOwnedInstructions }),
    questions: Object.freeze([]),
    occurrenceSignature: digestJson({
      groupId,
      paperChromeInstructionIds: [
        occurrence.paperChrome.part.instructionId,
        occurrence.paperChrome.section.instructionId,
        ...occurrence.paperChrome.instructions.map((instruction) => instruction.instructionId),
      ],
      sourceBlockIds: sourceBlocks.map((block) => block.nodeId),
      ...(sourceStarterBlockRefs === undefined ? {} : { sourceStarterBlockRefs }),
      answerRegionRef: answerRegion.answerRegionRef,
      responseSlotId: answerRegion.responseSlotId,
    }),
    semanticSignature: digestJson(semantic),
  })
}

// Same media closure as Reading figures: exact artifact identity, digest,
// dimensions, source artifact, optional presentation intent, unique placement.
function applicationPromptFigureResolver(input, occurrence) {
  const { groupId } = input
  if (!Array.isArray(occurrence.media)) {
    throw rejected(`Canonical Application Writing occurrence ${groupId} has invalid media closure`)
  }
  const mediaById = new Map()
  const presentationRequired = occurrence.media.some((media) => media?.presentation !== undefined)
  for (const media of occurrence.media) {
    if (
      !media
      || typeof media.mediaId !== 'string'
      || typeof media.sha256 !== 'string'
      || typeof media.mimeType !== 'string'
      || !Number.isInteger(media.pixelWidth)
      || !Number.isInteger(media.pixelHeight)
      || typeof media.sourceArtifactRef?.artifactId !== 'string'
      || (presentationRequired && !validateMediaPresentation(media.presentation))
      || mediaById.has(media.mediaId)
    ) {
      throw rejected(`Canonical Application Writing occurrence ${groupId} has invalid media closure`)
    }
    mediaById.set(media.mediaId, media)
  }
  const artifactsById = new Map()
  for (const artifact of input.consumption.mediaArtifacts || []) {
    if (artifactsById.has(artifact?.mediaId)) {
      throw rejected(`Canonical Application Writing occurrence ${groupId} has ambiguous prompt figure media`)
    }
    artifactsById.set(artifact?.mediaId, artifact)
  }
  const seen = new Set()
  const resolve = (block) => {
    const media = mediaById.get(block.mediaId)
    const artifact = artifactsById.get(block.mediaId)
    const bytes = decodeBase64Bytes(artifact?.encodedBytes)
    if (
      !media
      || seen.has(block.mediaId)
      || !artifact
      || artifact.mimeType !== media.mimeType
      || artifact.sha256 !== media.sha256
      || artifact.pixelWidth !== media.pixelWidth
      || artifact.pixelHeight !== media.pixelHeight
      || artifact.sourceArtifactRef?.artifactId !== media.sourceArtifactRef.artifactId
      || !bytes
      || sha256(bytes) !== media.sha256
    ) {
      throw rejected(`Canonical Application Writing occurrence ${groupId} has unresolved prompt figure media`)
    }
    seen.add(block.mediaId)
    const caption = media.presentation ? block.caption : []
    return {
      kind: 'figure',
      nodeId: block.nodeId,
      mediaId: block.mediaId,
      media: structuredClone(media),
      mediaArtifact: structuredClone(artifact),
      caption: textContent(caption),
      captionInlines: structuredClone(caption),
    }
  }
  resolve.complete = () => seen.size === mediaById.size
  return resolve
}

function projectApplicationWritingConsumerGroup(input, occurrence) {
  if (occurrence.writingMode === 'legacy_opaque') {
    return projectOpaqueLegacyWritingConsumerGroup(input, occurrence, {
      familyContractId: 'application-writing',
      groupType: 'writing',
      sourceTaskType: 'application',
      answerRegionRef: 'writing.application-box',
    })
  }
  const { groupId } = input
  if (
    typeof occurrence.paperChrome?.part?.partId !== 'string'
    || typeof occurrence.paperChrome.part.instructionId !== 'string'
    || typeof occurrence.paperChrome.part.text !== 'string'
    || !['render', 'suppress'].includes(
      occurrence.paperChrome.part.renderPolicy,
    )
    || typeof occurrence.paperChrome?.section?.sectionId !== 'string'
    || typeof occurrence.paperChrome.section.instructionId !== 'string'
    || typeof occurrence.paperChrome.section.text !== 'string'
    || !['render', 'suppress'].includes(
      occurrence.paperChrome.section.renderPolicy,
    )
    || !Array.isArray(occurrence.paperChrome.instructions)
    || occurrence.paperChrome.instructions.some(
      (instruction) =>
        typeof instruction?.instructionId !== 'string'
        || typeof instruction.text !== 'string'
        || typeof instruction.placement !== 'string'
        || !['render', 'suppress'].includes(instruction.renderPolicy),
    )
    || new Set([
      occurrence.paperChrome.part.instructionId,
      occurrence.paperChrome.section.instructionId,
      ...occurrence.paperChrome.instructions.map(
        (instruction) => instruction.instructionId,
      ),
    ]).size !== occurrence.paperChrome.instructions.length + 2
    || !Array.isArray(occurrence.numbering)
    || occurrence.numbering.length !== 0
    || !Array.isArray(occurrence.blanks)
    || occurrence.blanks.length !== 0
    || occurrence.choices?.ownership !== 'none'
    || Object.keys(occurrence.choices).length !== 1
    || !Array.isArray(occurrence.content?.blocks)
    || !Array.isArray(occurrence.prompt?.blocks)
    || occurrence.prompt.blocks.length === 0
    || typeof occurrence.writingTaskId !== 'string'
    || typeof occurrence.answerRegion?.answerRegionRef !== 'string'
    || typeof occurrence.answerRegion?.responseSlotId !== 'string'
    || !Array.isArray(occurrence.answerRegion?.givenTop)
    || !Array.isArray(occurrence.answerRegion?.givenBottom)
    || !Array.isArray(occurrence.contentRequirements)
    || occurrence.wordCountRuling?.countScope !== 'student_authored_only'
  ) {
    throw rejected(`Canonical Application Writing occurrence ${groupId} is incomplete`)
  }

  // Prompt figures exist only when the raw authority admitted them and this
  // consumer's own closure registers the renderer-owned capability.
  const hasPromptFigures = occurrence.content.blocks.some((block) => block?.kind === 'figure')
  if (hasPromptFigures && (
    !authorityAdmitsApplicationPromptFigures(input.consumption.authorityRef)
    || !consumerRendersApplicationPromptFigures(input.consumption.consumerContractRef)
  )) {
    throw rejected(`Canonical Application Writing occurrence ${groupId} requires the prompt-figure consumer capability`)
  }
  const contentById = new Map()
  for (const block of occurrence.content.blocks) {
    if (
      !(block?.kind === 'paragraph' && Array.isArray(block.inlines))
      && !(hasPromptFigures && block?.kind === 'figure' && typeof block.mediaId === 'string' && Array.isArray(block.caption))
      || typeof block.nodeId !== 'string'
      || contentById.has(block.nodeId)
    ) {
      throw rejected(`Canonical Application Writing occurrence ${groupId} has invalid content`)
    }
    contentById.set(block.nodeId, block)
  }
  const resolvePromptFigure = hasPromptFigures
    ? applicationPromptFigureResolver(input, occurrence)
    : null

  const promptBlocks = occurrence.prompt.blocks.map((block) => {
    if (
      !block
      || contentById.get(block.nodeId) !== block
      && digestJson(contentById.get(block.nodeId)) !== digestJson(block)
    ) {
      throw rejected(`Canonical Application Writing occurrence ${groupId} has invalid prompt ownership`)
    }
    if (block.kind === 'figure') return resolvePromptFigure(block)
    return {
      nodeId: block.nodeId,
      text: textContent(block.inlines),
      inlines: structuredClone(block.inlines),
    }
  })
  if (resolvePromptFigure && !resolvePromptFigure.complete()) {
    throw rejected(`Canonical Application Writing occurrence ${groupId} does not place every media item exactly once`)
  }
  if (new Set(promptBlocks.map((block) => block.nodeId)).size !== promptBlocks.length) {
    throw rejected(`Canonical Application Writing occurrence ${groupId} duplicates prompt content`)
  }

  const seenGivenPartIds = new Set()
  const seenGivenBlockRefs = new Set()
  const promptBlockIds = new Set(promptBlocks.map((block) => block.nodeId))
  const roleOrder = new Map([
    ['title', 0],
    ['salutation', 1],
    ['opening', 2],
    ['closing', 3],
    ['signature', 4],
  ])
  let previousRole = -1
  const projectGivenParts = (parts, placement) => parts.map((part) => {
    const block = contentById.get(part?.blockRef)
    const currentRole = roleOrder.get(part?.role)
    if (
      typeof part?.givenPartId !== 'string'
      || currentRole === undefined
      || currentRole < previousRole
      || part.placement !== placement
      || (
        placement === 'answer_region_top'
          ? !['title', 'salutation', 'opening'].includes(part.role)
          : !['closing', 'signature'].includes(part.role)
      )
      || !block
      || seenGivenPartIds.has(part.givenPartId)
      || seenGivenBlockRefs.has(part.blockRef)
      || promptBlockIds.has(part.blockRef)
      || block.kind !== 'paragraph'
    ) {
      throw rejected(`Canonical Application Writing occurrence ${groupId} has invalid fixed text`)
    }
    previousRole = currentRole
    seenGivenPartIds.add(part.givenPartId)
    seenGivenBlockRefs.add(part.blockRef)
    return {
      givenPartId: part.givenPartId,
      role: part.role,
      placement: part.placement,
      blockRef: part.blockRef,
      text: textContent(block.inlines),
      inlines: structuredClone(block.inlines),
    }
  })
  const givenTop = projectGivenParts(
    occurrence.answerRegion.givenTop,
    'answer_region_top',
  )
  const givenBottom = projectGivenParts(
    occurrence.answerRegion.givenBottom,
    'answer_region_bottom',
  )
  let drawingArea
  if (Object.hasOwn(occurrence.answerRegion, 'drawingArea')) {
    const area = occurrence.answerRegion.drawingArea
    const block = contentById.get(area?.labelBlockRef)
    if (!authorityAdmitsApplicationDrawingArea(input.consumption.authorityRef)
      || !consumerRendersApplicationDrawingArea(input.consumption.consumerContractRef)
      || area?.drawingAreaId !== `drawing-area:${groupId}:1`
      || area.placement !== 'top_right' || block?.kind !== 'paragraph'
      || !textContent(block.inlines).trim()
      || promptBlockIds.has(area.labelBlockRef) || seenGivenBlockRefs.has(area.labelBlockRef)
      || occurrence.anchors?.drawingAreaIds?.join(',') !== area.drawingAreaId) {
      throw rejected(`Canonical Application Writing occurrence ${groupId} requires one exclusively owned source drawing label and capable authority/consumer`)
    }
    drawingArea = {
      drawingAreaId: area.drawingAreaId, placement: area.placement,
      labelBlockRef: area.labelBlockRef, text: textContent(block.inlines),
      inlines: structuredClone(block.inlines),
    }
  }

  if (hasPromptFigures || drawingArea) {
    const expectedPrompt = occurrence.content.blocks.filter(block => !seenGivenBlockRefs.has(block.nodeId) && block.nodeId !== drawingArea?.labelBlockRef)
    const firstGivenIndex = occurrence.content.blocks.findIndex(block => seenGivenBlockRefs.has(block.nodeId))
    if (expectedPrompt.length !== promptBlocks.length
      || expectedPrompt.some((block, index) => block.nodeId !== promptBlocks[index].nodeId)
      || (firstGivenIndex >= 0 && occurrence.content.blocks.slice(firstGivenIndex).some(block => block.kind === 'figure'))) {
      throw rejected(`Canonical Application Writing occurrence ${groupId} has incomplete or reordered prompt content`)
    }
  }

  const anchors = occurrence.anchors
  const contentNodeIds = occurrence.content.blocks.flatMap((block) => [
    block.nodeId,
    ...(block.kind === 'figure' ? block.caption : block.inlines).map((inline) => inline.nodeId),
  ])
  if (
    !anchors
    || new Set(anchors.contentNodeIds).size !== contentNodeIds.length
    || contentNodeIds.some((nodeId) => !anchors.contentNodeIds.includes(nodeId))
    || anchors.requirementIds?.join(',') !== occurrence.contentRequirements
      .map((requirement) => requirement.requirementId).join(',')
    || anchors.givenPartIds?.join(',') !== [...givenTop, ...givenBottom]
      .map((part) => part.givenPartId).join(',')
    || anchors.responseSlotId !== occurrence.answerRegion.responseSlotId
  ) {
    throw rejected(`Canonical Application Writing occurrence ${groupId} has invalid anchors`)
  }

  const answerRegion = {
    answerRegionRef: occurrence.answerRegion.answerRegionRef,
    responseSlotId: occurrence.answerRegion.responseSlotId,
    givenTop,
    givenBottom,
    ...(drawingArea ? { drawingArea } : {}),
  }
  const semantic = {
    paperId: input.consumption.paperId,
    groupId,
    familyContractId: 'application-writing',
    paperChrome: structuredClone(occurrence.paperChrome),
    writingTaskId: occurrence.writingTaskId,
    promptBlocks,
    situation: structuredClone(occurrence.situation),
    contentRequirements: structuredClone(occurrence.contentRequirements),
    wordCountRuling: structuredClone(occurrence.wordCountRuling),
    answerRegion,
    anchors: structuredClone(anchors),
  }
  return Object.freeze({
    groupType: 'writing',
    ...semantic,
    questions: Object.freeze([]),
    occurrenceSignature: digestJson({
      groupId,
      paperChromeInstructionIds: [
        occurrence.paperChrome.part.instructionId,
        occurrence.paperChrome.section.instructionId,
        ...occurrence.paperChrome.instructions.map(
          (instruction) => instruction.instructionId,
        ),
      ],
      promptBlockIds: promptBlocks.map((block) => block.nodeId),
      givenPartIds: [...givenTop, ...givenBottom]
        .map((part) => part.givenPartId),
      answerRegionRef: answerRegion.answerRegionRef,
      responseSlotId: answerRegion.responseSlotId,
      ...(drawingArea ? { drawingAreaId: drawingArea.drawingAreaId } : {}),
    }),
    semanticSignature: digestJson(semantic),
  })
}

function projectContinuationWritingConsumerGroup(input, occurrence) {
  if (occurrence.writingMode === 'legacy_opaque') {
    return projectOpaqueLegacyWritingConsumerGroup(input, occurrence, {
      familyContractId: 'continuation-writing',
      groupType: 'continuation',
      sourceTaskType: 'continuation',
      answerRegionRef: 'writing.continuation-box',
    })
  }
  const { groupId } = input
  const sourceInstruction = occurrence.sourceInstruction
  const matchingSourceInstructionChrome =
    occurrence.paperChrome?.instructions?.filter((instruction) =>
      instruction?.instructionId === sourceInstruction?.instructionId) || []
  const requiresSourceInstruction =
    input.consumption.authorityRef?.manifestVersion === '49'
  if (
    typeof occurrence.paperChrome?.part?.partId !== 'string'
    || typeof occurrence.paperChrome.part.instructionId !== 'string'
    || typeof occurrence.paperChrome.part.text !== 'string'
    || !['render', 'suppress'].includes(
      occurrence.paperChrome.part.renderPolicy,
    )
    || typeof occurrence.paperChrome?.section?.sectionId !== 'string'
    || typeof occurrence.paperChrome.section.instructionId !== 'string'
    || typeof occurrence.paperChrome.section.text !== 'string'
    || !['render', 'suppress'].includes(
      occurrence.paperChrome.section.renderPolicy,
    )
    || !Array.isArray(occurrence.paperChrome.instructions)
    || occurrence.paperChrome.instructions.some(
      (instruction) =>
        typeof instruction?.instructionId !== 'string'
        || typeof instruction.text !== 'string'
        || typeof instruction.placement !== 'string'
        || !['render', 'suppress'].includes(instruction.renderPolicy),
    )
    || new Set([
      occurrence.paperChrome.part.instructionId,
      occurrence.paperChrome.section.instructionId,
      ...occurrence.paperChrome.instructions.map(
        (instruction) => instruction.instructionId,
      ),
    ]).size !== occurrence.paperChrome.instructions.length + 2
    || !Array.isArray(occurrence.numbering)
    || occurrence.numbering.length !== 0
    || !Array.isArray(occurrence.blanks)
    || occurrence.blanks.length !== 0
    || occurrence.choices?.ownership !== 'none'
    || Object.keys(occurrence.choices || {}).length !== 1
    || !Array.isArray(occurrence.content?.blocks)
    || !Array.isArray(occurrence.material?.blocks)
    || occurrence.material.blocks.length === 0
    || typeof occurrence.writingTaskId !== 'string'
    || occurrence.wordCountRuling?.countScope !== 'student_authored_only'
    || occurrence.answerRegion?.answerRegionRef !== 'writing.continuation-box'
    || typeof occurrence.answerRegion?.responseSlotId !== 'string'
    || !Array.isArray(occurrence.answerRegion?.starterLines)
    || ![0, 2].includes(occurrence.answerRegion.starterLines.length)
    || (
      requiresSourceInstruction
      && (
        !sourceInstruction
        || Object.keys(sourceInstruction).sort().join(',')
          !== [
            'authorityObservationRef',
            'instructionId',
            'placement',
            'text',
          ].join(',')
        || sourceInstruction.instructionId
          !== 'writing.continuation.prompt'
        || sourceInstruction.placement !== 'group_instruction'
        || typeof sourceInstruction.text !== 'string'
        || sourceInstruction.text.length === 0
        || typeof sourceInstruction.authorityObservationRef !== 'string'
        || sourceInstruction.authorityObservationRef.length === 0
        || matchingSourceInstructionChrome.length !== 1
        || matchingSourceInstructionChrome[0].placement
          !== sourceInstruction.placement
        || matchingSourceInstructionChrome[0].text !== sourceInstruction.text
      )
    )
  ) {
    throw rejected(
      `Canonical Continuation Writing occurrence ${groupId} is incomplete`,
    )
  }

  const contentById = new Map()
  for (const block of occurrence.content.blocks) {
    if (
      block?.kind !== 'paragraph'
      || typeof block.nodeId !== 'string'
      || !Array.isArray(block.inlines)
      || block.inlines.length === 0
      || contentById.has(block.nodeId)
    ) {
      throw rejected(
        `Canonical Continuation Writing occurrence ${groupId} has invalid content`,
      )
    }
    contentById.set(block.nodeId, block)
  }

  const ownedBlockIds = new Set()
  const materialBlocks = occurrence.material.blocks.map((block) => {
    if (
      !block
      || !contentById.has(block.nodeId)
      || digestJson(contentById.get(block.nodeId)) !== digestJson(block)
      || ownedBlockIds.has(block.nodeId)
    ) {
      throw rejected(
        `Canonical Continuation Writing occurrence ${groupId} has invalid material ownership`,
      )
    }
    ownedBlockIds.add(block.nodeId)
    return {
      nodeId: block.nodeId,
      text: textContent(block.inlines),
      inlines: structuredClone(block.inlines),
    }
  })

  const seenStarterIds = new Set()
  const starterLines = occurrence.answerRegion.starterLines.map((starter) => {
    const block = contentById.get(starter?.contentRef)
    if (
      typeof starter?.starterId !== 'string'
      || typeof starter.authorityObservationRef !== 'string'
      || !block
      || ownedBlockIds.has(starter.contentRef)
      || seenStarterIds.has(starter.starterId)
    ) {
      throw rejected(
        `Canonical Continuation Writing occurrence ${groupId} has invalid starter ownership`,
      )
    }
    ownedBlockIds.add(starter.contentRef)
    seenStarterIds.add(starter.starterId)
    return {
      starterId: starter.starterId,
      contentRef: starter.contentRef,
      authorityObservationRef: starter.authorityObservationRef,
      text: textContent(block.inlines),
      inlines: structuredClone(block.inlines),
    }
  })
  if (ownedBlockIds.size !== contentById.size) {
    throw rejected(
      `Canonical Continuation Writing occurrence ${groupId} has unowned content`,
    )
  }

  const anchors = occurrence.anchors
  const contentNodeIds = occurrence.content.blocks.flatMap((block) => [
    block.nodeId,
    ...block.inlines.map((inline) => inline.nodeId),
  ])
  if (
    !anchors
    || new Set(anchors.contentNodeIds).size !== contentNodeIds.length
    || contentNodeIds.some((nodeId) => !anchors.contentNodeIds.includes(nodeId))
    || anchors.starterIds?.join(',') !== starterLines
      .map((starter) => starter.starterId).join(',')
    || anchors.responseSlotId !== occurrence.answerRegion.responseSlotId
  ) {
    throw rejected(
      `Canonical Continuation Writing occurrence ${groupId} has invalid anchors`,
    )
  }

  const answerRegion = {
    answerRegionRef: occurrence.answerRegion.answerRegionRef,
    responseSlotId: occurrence.answerRegion.responseSlotId,
    starterLines,
  }
  const semantic = {
    paperId: input.consumption.paperId,
    groupId,
    familyContractId: 'continuation-writing',
    paperChrome: structuredClone(occurrence.paperChrome),
    writingTaskId: occurrence.writingTaskId,
    materialBlocks,
    wordCountRuling: structuredClone(occurrence.wordCountRuling),
    answerRegion,
    anchors: structuredClone(anchors),
  }
  return Object.freeze({
    groupType: 'continuation',
    ...semantic,
    questions: Object.freeze([]),
    occurrenceSignature: digestJson({
      groupId,
      paperChromeInstructionIds: [
        occurrence.paperChrome.part.instructionId,
        occurrence.paperChrome.section.instructionId,
        ...occurrence.paperChrome.instructions.map(
          (instruction) => instruction.instructionId,
        ),
      ],
      materialBlockIds: materialBlocks.map((block) => block.nodeId),
      starterIds: starterLines.map((starter) => starter.starterId),
      answerRegionRef: answerRegion.answerRegionRef,
      responseSlotId: answerRegion.responseSlotId,
    }),
    semanticSignature: digestJson(semantic),
  })
}

export function selectConsumerGroupMode({
  consumption,
  familyContractId,
  groupId,
}) {
  if (consumption?.disposition !== 'ready' || !Array.isArray(consumption.selections)) {
    throw rejected('A ready whole-paper Consumption Plan is required')
  }
  const familySelections = consumption.selections.filter(
    (selection) => selection.familyContractId === familyContractId,
  )
  if (
    familySelections.length !== 1
    || familySelections[0].mode !== 'canonical'
  ) {
    throw rejected(`Family ${familyContractId} has no unambiguous whole-family selection`)
  }
  const selection = familySelections[0]
  if (
    !Array.isArray(selection.groupIds)
    || new Set(selection.groupIds).size !== selection.groupIds.length
    || !selection.groupIds.includes(groupId)
  ) {
    throw rejected(`Family ${familyContractId} selection is partial or ambiguous`)
  }
  return selection
}

export function selectedFamilyContractIdForGroup({
  consumption,
  groupId,
}) {
  if (consumption?.disposition !== 'ready' || !Array.isArray(consumption.selections)) {
    throw rejected('A ready whole-paper Consumption Plan is required')
  }
  const selections = consumption.selections.filter((selection) => {
    if (!Array.isArray(selection?.groupIds)) {
      throw rejected('A Consumption Plan selection has invalid Group ownership')
    }
    return selection.groupIds.includes(groupId)
  })
  if (selections.length > 1) {
    throw rejected(`Group ${groupId} belongs to multiple family selections`)
  }
  if (selections.length === 0) return null
  const familyContractId = selections[0].familyContractId
  if (!SUPPORTED_FAMILIES.has(familyContractId)) {
    throw rejected(`Group ${groupId} belongs to an unsupported consumer family`)
  }
  return familyContractId
}

function selectOccurrence(input) {
  const { consumption, familyContractId, groupId } = input
  const selection = selectConsumerGroupMode(input)
  if (selection.mode !== 'canonical') {
    throw rejected(`Family ${familyContractId} is not wholly canonical`)
  }
  if (
    !Array.isArray(selection.projectedOccurrences)
    || selection.projectedOccurrences.length !== selection.groupIds.length
  ) {
    throw rejected(`Family ${familyContractId} selection is partial or ambiguous`)
  }
  const occurrenceGroupIds = selection.projectedOccurrences.map(
    (occurrence) => occurrence?.groupId,
  )
  if (
    selection.projectedOccurrences.some(
      (occurrence) =>
        occurrence?.kind !== 'group'
        || occurrence.familyContractId !== familyContractId,
    )
    || new Set(occurrenceGroupIds).size !== occurrenceGroupIds.length
    || occurrenceGroupIds.some((id) => !selection.groupIds.includes(id))
  ) {
    throw rejected(`Family ${familyContractId} projected occurrences do not close the selection`)
  }
  const authorityRef = consumption?.authorityRef
  const requiresOccurrenceIntegrity =
    familyContractId === 'listening'
    || familyContractId === 'cloze'
    || familyContractId === 'grammar-fill'
    || (
      familyContractId === 'continuation-writing'
      && ['49', '50', '51', '52', '54', '55', '57', '58', '59', '61', '62', '64', '66', '67', '68', '69', '71', '73', '74'].includes(authorityRef?.manifestVersion)
    )
    || (
      familyContractId === 'seven-choices'
      && ['47', '48', '49', '50', '51', '52', '54', '55', '57', '58', '59', '61', '62', '64', '66', '67', '68', '69', '71', '73', '74'].includes(authorityRef?.manifestVersion)
    )
  if (requiresOccurrenceIntegrity) {
    const consumptionDigest = sha256(`${stableStringify(consumption)}\n`)
    const verifiedHistoricalDigests = familyContractId === 'cloze'
      ? VERIFIED_PRE_V18_CLOZE_CONSUMPTION_DIGESTS
      : familyContractId === 'grammar-fill'
        ? VERIFIED_PRE_V20_GRAMMAR_FILL_CONSUMPTION_DIGESTS
        : new Set()
    const verifiedHistoricalPlan =
      authorityRef === undefined
      && selection.projectedOccurrenceDigests === undefined
      && verifiedHistoricalDigests.has(consumptionDigest)
    if (!verifiedHistoricalPlan) {
      if (!resolveCanonicalAuthority(authorityRef).ok) {
        throw rejected(
          `Family ${familyContractId} Consumption Plan authority is unavailable`,
        )
      }
      if (!Array.isArray(selection.projectedOccurrenceDigests)) {
        throw rejected(
          `Family ${familyContractId} projected occurrence integrity is required`,
        )
      }
      const digestByGroupId = new Map(
        selection.projectedOccurrenceDigests.map((entry) => [
          entry?.groupId,
          entry?.digest,
        ]),
      )
      if (
        selection.projectedOccurrenceDigests.length
          !== selection.projectedOccurrences.length
        || digestByGroupId.size !== selection.projectedOccurrences.length
        || selection.projectedOccurrences.some(
          (occurrence) =>
            digestByGroupId.get(occurrence.groupId) !== digestJson(occurrence),
        )
      ) {
        throw rejected(
          `Family ${familyContractId} projected occurrence integrity is invalid`,
        )
      }
    }
  }
  const occurrences = selection.projectedOccurrences.filter(
    (occurrence) => occurrence?.kind === 'group' && occurrence.groupId === groupId,
  )
  if (occurrences.length !== 1) {
    throw rejected(`Canonical occurrence ${groupId} is missing or duplicated`)
  }
  return occurrences[0]
}

export function resolveCanonicalConsumerOccurrence(input) {
  return selectOccurrence(input)
}

/**
 * Shared post-loader projection for Screen and Print/PDF.
 *
 * It accepts only a complete whole-paper Consumption Plan. It does not read
 * source assets, sidecars, raw markers, renderer flags, or legacy fields.
 */
export function projectCanonicalConsumerGroup(input) {
  const { familyContractId, groupId } = input
  if (!SUPPORTED_FAMILIES.has(familyContractId)) {
    throw rejected(`Unsupported canonical consumer family ${familyContractId}`)
  }
  const occurrence = selectOccurrence(input)
  if (occurrence.familyContractId !== familyContractId) {
    throw rejected(`Canonical occurrence ${groupId} belongs to another family`)
  }
  if (occurrence.sourcePresentation !== undefined
    && (!['62', '64', '66', '67', '68', '69', '71', '73', '74'].includes(input.consumption.authorityRef?.manifestVersion)
      || !validCanonicalSourcePresentation(occurrence.sourcePresentation))) {
    throw rejected(`Canonical occurrence ${groupId} has invalid source presentation`)
  }
  if (familyContractId === 'reading') {
    return projectReadingConsumerGroup(input, occurrence)
  }
  if (familyContractId === 'listening') {
    return projectListeningConsumerGroup(input, occurrence)
  }
  if (familyContractId === 'application-writing') {
    return projectApplicationWritingConsumerGroup(input, occurrence)
  }
  if (familyContractId === 'continuation-writing') {
    return projectContinuationWritingConsumerGroup(input, occurrence)
  }
  if (
    !Array.isArray(occurrence.numbering)
    || !Array.isArray(occurrence.blanks)
    || occurrence.numbering.length !== occurrence.blanks.length
  ) {
    throw rejected(`Canonical occurrence ${groupId} has incomplete Question/Blank identity`)
  }

  const numberByQuestionId = new Map()
  const questionIdByBlankId = new Map()
  const promptByBlankId = new Map()
  const blankQuestionIds = new Set()
  for (const assignment of occurrence.numbering) {
    if (
      typeof assignment.questionId !== 'string'
      || !Number.isInteger(assignment.number)
      || numberByQuestionId.has(assignment.questionId)
    ) {
      throw rejected(`Canonical occurrence ${groupId} has invalid numbering`)
    }
    numberByQuestionId.set(assignment.questionId, assignment.number)
  }
  for (const blank of occurrence.blanks) {
    if (
      typeof blank.blankId !== 'string'
      || !numberByQuestionId.has(blank.questionId)
      || questionIdByBlankId.has(blank.blankId)
      || blankQuestionIds.has(blank.questionId)
      || (
        familyContractId === 'grammar-fill'
        && Number(input.consumption?.authorityRef?.manifestVersion) >= 23
        && (
          !Object.hasOwn(blank, 'prompt')
          || (
            blank.prompt !== null
            && (
              typeof blank.prompt !== 'string'
              || blank.prompt.length === 0
              || /[()\r\n]/u.test(blank.prompt)
            )
          )
        )
      )
    ) {
      throw rejected(`Canonical occurrence ${groupId} has invalid Blank joins`)
    }
    questionIdByBlankId.set(blank.blankId, blank.questionId)
    if (familyContractId === 'grammar-fill' && Object.hasOwn(blank, 'prompt')) {
      promptByBlankId.set(blank.blankId, blank.prompt)
    }
    blankQuestionIds.add(blank.questionId)
  }
  if (
    blankQuestionIds.size !== numberByQuestionId.size
    || [...numberByQuestionId.keys()].some(
      (questionId) => !blankQuestionIds.has(questionId),
    )
  ) throw rejected(`Canonical occurrence ${groupId} does not join every Question to one Blank`)

  const seenBlanks = new Set()
  const passageRoles = familyContractId === 'seven-choices'
    && ['47', '48', '49', '50', '51', '52', '54', '55', '57', '58', '59', '61', '62', '64', '66', '67', '68', '69', '71', '73', '74'].includes(input.consumption?.authorityRef?.manifestVersion)
    ? resolvePassageBlockRoles(
        occurrence.content?.blocks,
        occurrence.passageBlockRoles,
      )
    : { ok: true, rolesByNodeId: new Map() }
  if (!passageRoles.ok) {
    throw rejected(
      `Canonical occurrence ${groupId} has invalid passage roles`,
    )
  }
  const paragraphs = occurrence.content?.blocks?.map((block) => {
    if (block?.kind !== 'paragraph' || typeof block.nodeId !== 'string' || !Array.isArray(block.inlines)) {
      throw rejected(`Canonical occurrence ${groupId} contains an unsupported content block`)
    }
    const grammarFollowingTextByIndex = new Map()
    if (familyContractId === 'grammar-fill') {
      block.inlines.forEach((inline, index) => {
        if (inline?.kind !== 'blank_ref') return
        const prompt = promptByBlankId.get(inline.blankId)
        if (prompt === null || prompt === undefined) return
        const following = block.inlines[index + 1]
        const sourcePrefix = grammarFillPromptPrefix(following, prompt)
        if (sourcePrefix === null) {
          throw rejected(
            `Canonical occurrence ${groupId} prompt identity disagrees with source text`,
          )
        }
        grammarFollowingTextByIndex.set(
          index + 1,
          following.text.slice(sourcePrefix.length),
        )
      })
    }
    return {
      paragraphId: block.nodeId,
      role: passageRoles.rolesByNodeId.get(block.nodeId) || 'body',
      nodes: block.inlines.map((inline, inlineIndex) => {
        if (inline?.kind === 'text' && typeof inline.text === 'string') {
          return {
            type: 'text',
            text:
              grammarFollowingTextByIndex.get(inlineIndex)
              ?? inline.text,
          }
        }
        if (inline?.kind !== 'blank_ref' || !questionIdByBlankId.has(inline.blankId) || seenBlanks.has(inline.blankId)) {
          throw rejected(`Canonical occurrence ${groupId} has a missing, duplicated, or unknown Blank`)
        }
        seenBlanks.add(inline.blankId)
        const questionId = questionIdByBlankId.get(inline.blankId)
        return {
          type: 'blank',
          blankId: inline.blankId,
          questionId,
          questionNo: numberByQuestionId.get(questionId),
          ...(
            promptByBlankId.get(inline.blankId) != null
              ? { hint: promptByBlankId.get(inline.blankId) }
              : {}
          ),
        }
      }),
    }
  })
  if (!Array.isArray(paragraphs) || seenBlanks.size !== occurrence.blanks.length) {
    throw rejected(`Canonical occurrence ${groupId} does not render every Blank exactly once`)
  }

  const choiceSets = occurrence.choices?.ownership === 'per_question'
    ? occurrence.choices.sets
    : occurrence.choices?.ownership === 'none'
      ? []
      : familyContractId === 'seven-choices'
        && occurrence.choices?.ownership === 'shared_bank'
        ? []
        : null
  if (!Array.isArray(choiceSets)) {
    throw rejected(`Canonical occurrence ${groupId} has incompatible choice ownership`)
  }
  if (
    familyContractId === 'cloze'
    && (
      choiceSets.length !== occurrence.numbering.length
      || new Set(choiceSets.map((set) => set.questionId)).size !== choiceSets.length
      || choiceSets.some((set) => !numberByQuestionId.has(set.questionId))
    )
  ) {
    throw rejected(`Canonical occurrence ${groupId} does not carry one A-D set per Question`)
  }
  const choicesByQuestionId = new Map(choiceSets.map((set) => [set.questionId, set]))
  const questions = occurrence.numbering.map(({ questionId, number }) => {
    const choiceSet = choicesByQuestionId.get(questionId)
    const options = choiceSet
      ? choiceSet.options.map((option) => ({
          optionId: option.optionId,
          label: option.label,
          text: textContent(option.content),
          content: option.content,
        }))
      : []
    const layoutPlan = options.length === 0
      ? null
      : (familyContractId === 'cloze'
          ? layoutFixedFourColumnClozeOptionSet
          : layoutAbcdOptionSet)({
          owner: 'question',
          questionId,
          options: choiceSet.options,
        })
    if (layoutPlan && layoutPlan.status !== 'selected') {
      throw rejected(`Canonical A-D placement failed for ${questionId}`, [layoutPlan])
    }
    return {
      questionId,
      questionNo: number,
      ...(familyContractId === 'seven-choices'
        ? {
            blankId: occurrence.blanks.find(
              (blank) => blank.questionId === questionId,
            )?.blankId,
          }
        : {}),
      stem: '',
      options,
      layoutPlan,
      placementSignature: layoutPlan
        ? abcdPlacementSignature(layoutPlan)
        : null,
    }
  })

  let questionBlankPairs
  let optionBank
  let occurrenceSignature
  if (familyContractId === 'seven-choices') {
    questionBlankPairs = occurrence.questionBlankPairs
    if (
      !Array.isArray(questionBlankPairs)
      || questionBlankPairs.length !== 5
      || new Set(questionBlankPairs.map((pair) => pair?.questionId)).size !== 5
      || new Set(questionBlankPairs.map((pair) => pair?.blankId)).size !== 5
      || questionBlankPairs.some(
        (pair, index) =>
          Object.keys(pair || {}).sort().join(',') !== 'blankId,questionId'
          || pair.questionId !== questions[index]?.questionId
          || pair.blankId !== questions[index]?.blankId,
      )
    ) {
      throw rejected(`Canonical occurrence ${groupId} does not carry five ordered Question/Blank pairs`)
    }
    const options = occurrence.choices.options
    if (
      Object.keys(occurrence.choices).sort().join(',') !== 'bankId,options,ownership'
      || typeof occurrence.choices.bankId !== 'string'
      || !Array.isArray(options)
      || options.length !== 7
      || new Set(options.map((option) => option?.optionId)).size !== 7
      || options.some(
        (option) =>
          typeof option.optionId !== 'string'
          || typeof option.label !== 'string'
          || !Array.isArray(option.content),
      )
      || !occurrence.anchors
      || occurrence.anchors.questionIds?.join(',') !== questionBlankPairs.map((pair) => pair.questionId).join(',')
      || occurrence.anchors.blankIds?.join(',') !== questionBlankPairs.map((pair) => pair.blankId).join(',')
      || occurrence.anchors.optionIds?.join(',') !== options.map((option) => option.optionId).join(',')
    ) {
      throw rejected(`Canonical occurrence ${groupId} does not carry one closed seven-option bank`)
    }
    optionBank = {
      bankId: occurrence.choices.bankId,
      options: options.map((option) => ({
        optionId: option.optionId,
        label: option.label,
        text: textContent(option.content),
        content: option.content,
      })),
    }
    occurrenceSignature = digestJson({
      groupId,
      questionBlankPairs,
      passageBlockRoles: occurrence.passageBlockRoles,
      bankId: optionBank.bankId,
      optionIds: optionBank.options.map((option) => option.optionId),
    })
  }

  const semantic = {
    paperId: input.consumption.paperId,
    groupId,
    familyContractId,
    paragraphs,
    questions: questions.map(({ layoutPlan: _layoutPlan, placementSignature: _placementSignature, ...question }) => question),
    ...(optionBank ? { optionBank } : {}),
  }
  return Object.freeze({
    groupType:
      familyContractId === 'grammar-fill'
        ? 'grammarFill'
        : familyContractId === 'seven-choices'
          ? 'sevenChoices'
          : 'cloze',
    ...semantic,
    paragraphs,
    questions,
    ...(questionBlankPairs ? { questionBlankPairs } : {}),
    ...(occurrenceSignature ? { occurrenceSignature } : {}),
    semanticSignature: digestJson(semantic),
  })
}

/**
 * Resolve shared writing chrome once for an ordered set of rendered Groups.
 *
 * A Profile part may own several writing sections, and one section may own
 * several writing Groups. The first rendered canonical Group for a part
 * carries its part heading; the first rendered canonical Group for a section
 * carries its section heading. This is derived from the ready whole-paper
 * Consumption Plan, never from PaperAsset chrome or renderer literals.
 */
export function projectCanonicalWritingChrome({
  consumption,
  groupId,
  renderedGroupIds,
}) {
  if (
    renderedGroupIds !== undefined
    && (
      !Array.isArray(renderedGroupIds)
      || new Set(renderedGroupIds).size !== renderedGroupIds.length
    )
  ) {
    throw rejected('Rendered canonical writing Group order is invalid')
  }
  const orderedGroupIds = renderedGroupIds ?? consumption?.selections
    ?.filter(
      (selection) =>
        selection?.mode === 'canonical'
        && [
          'application-writing',
          'continuation-writing',
        ].includes(selection.familyContractId),
    )
    .flatMap((selection) => selection.groupIds)
  if (!Array.isArray(orderedGroupIds) || !orderedGroupIds.includes(groupId)) {
    throw rejected(`Canonical writing Group ${groupId} is outside the rendered order`)
  }
  const canonicalWritingOrder = consumption?.selections
    ?.filter(
      (selection) =>
        selection?.mode === 'canonical'
        && [
          'application-writing',
          'continuation-writing',
        ].includes(selection.familyContractId),
    )
    .flatMap((selection) => selection.groupIds)
  const renderedCanonicalWritingOrder = orderedGroupIds.filter(
    (candidateGroupId) =>
      canonicalWritingOrder?.includes(candidateGroupId),
  )
  const expectedRenderedWritingOrder = canonicalWritingOrder?.filter(
    (candidateGroupId) => orderedGroupIds.includes(candidateGroupId),
  )
  if (
    !Array.isArray(canonicalWritingOrder)
    || digestJson(renderedCanonicalWritingOrder)
      !== digestJson(expectedRenderedWritingOrder)
  ) {
    throw rejected('Rendered canonical writing Group order is invalid')
  }

  const renderedWritingGroups = []
  for (const candidateGroupId of orderedGroupIds) {
    const familyContractId = selectedFamilyContractIdForGroup({
      consumption,
      groupId: candidateGroupId,
    })
    if (
      ![
        'application-writing',
        'continuation-writing',
      ].includes(familyContractId)
    ) continue
    const selection = selectConsumerGroupMode({
      consumption,
      familyContractId,
      groupId: candidateGroupId,
    })
    if (selection.mode !== 'canonical') continue
    renderedWritingGroups.push({
      groupId: candidateGroupId,
      canonicalGroup: projectCanonicalConsumerGroup({
        consumption,
        familyContractId,
        groupId: candidateGroupId,
      }),
    })
  }
  const target = renderedWritingGroups.find(
    (candidate) => candidate.groupId === groupId,
  )
  if (!target) {
    throw rejected(`Canonical writing Group ${groupId} is not renderable`)
  }

  const samePart = renderedWritingGroups.filter(
    (candidate) =>
      candidate.canonicalGroup.paperChrome.part.partId
      === target.canonicalGroup.paperChrome.part.partId,
  )
  const targetPart = target.canonicalGroup.paperChrome.part
  if (
    samePart.length === 0
    || samePart.some(
      (candidate) =>
        digestJson(candidate.canonicalGroup.paperChrome.part)
          !== digestJson(targetPart),
    )
  ) {
    throw rejected(
      `Canonical writing part ${targetPart.partId} is inconsistent`,
    )
  }
  const targetSection = target.canonicalGroup.paperChrome.section
  const sameSection = samePart.filter(
    (candidate) =>
      candidate.canonicalGroup.paperChrome.section.sectionId
        === targetSection.sectionId,
  )
  if (
    sameSection.length === 0
    || sameSection.some(
      (candidate) =>
        digestJson(candidate.canonicalGroup.paperChrome.section)
          !== digestJson(targetSection),
    )
  ) {
    throw rejected(
      `Canonical writing section ${targetSection.sectionId} is inconsistent`,
    )
  }

  return Object.freeze({
    part: samePart[0].groupId === groupId
      && targetPart.renderPolicy === 'render'
      ? structuredClone(targetPart)
      : null,
    section: sameSection[0].groupId === groupId
      && targetSection.renderPolicy === 'render'
        ? structuredClone(target.canonicalGroup.paperChrome.section)
        : null,
    instructions: structuredClone(
      target.canonicalGroup.paperChrome.instructions.filter(
        (instruction) => instruction.renderPolicy === 'render',
      ),
    ),
  })
}

/**
 * A rendered Continuation Writing document made entirely from canonical
 * Writing Groups already owns its complete visible hierarchy through
 * paperChrome. Caller-provided export titles remain document metadata in that
 * case; rendering them as an additional paper heading would create structure
 * that Screen does not have.
 */
export function canonicalWritingChromeOwnsRenderedDocument({
  consumption,
  renderedGroupIds,
}) {
  if (
    !Array.isArray(renderedGroupIds)
    || renderedGroupIds.length === 0
    || new Set(renderedGroupIds).size !== renderedGroupIds.length
  ) {
    return false
  }
  let hasContinuationWriting = false
  const ownsEveryGroup = renderedGroupIds.every((groupId) => {
    const familyContractId = selectedFamilyContractIdForGroup({
      consumption,
      groupId,
    })
    if (
      ![
        'application-writing',
        'continuation-writing',
      ].includes(familyContractId)
    ) {
      return false
    }
    if (familyContractId === 'continuation-writing') {
      hasContinuationWriting = true
    }
    return selectConsumerGroupMode({
      consumption,
      familyContractId,
      groupId,
    }).mode === 'canonical'
  })
  return ownsEveryGroup && hasContinuationWriting
}
