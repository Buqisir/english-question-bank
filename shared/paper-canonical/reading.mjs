import {
  FRAMED_COLUMNS_COLUMN_COUNT,
  framedColumnsHeadingBlock,
  isFramedColumnsBlock,
  isQuestionLikeRichBlock,
  richBlockInlineSets,
} from './richContent.mjs'
import { resolvePassageBlockRoles } from './passageBlockRoles.mjs'
import { exactKeys, isRecordValue } from './stable.mjs'
import { validateReadingFigureLayout } from './readingFigureLayout.mjs'

function issue(code, disposition, path, message) {
  return { code, disposition, path, message }
}

function literalInlineIssues(inlines, path, allowSourceMarks = false) {
  if (!Array.isArray(inlines) || inlines.length === 0) {
    return [issue('READING_INLINE_INCOMPLETE', 'incomplete_source', path, 'Reading literal content requires at least one inline')]
  }
  const issues = []
  for (const [index, inline] of inlines.entries()) {
    if (
      !isRecordValue(inline)
      || !exactKeys(inline, ['kind', 'nodeId', 'text',
        ...(allowSourceMarks && Object.hasOwn(inline, 'marks') ? ['marks'] : []),
      ])
      || (Object.hasOwn(inline, 'marks')
        && !['["bold"]', '["underline"]', '["bold","underline"]'].includes(JSON.stringify(inline.marks)))
      || inline.kind !== 'text'
      || typeof inline.nodeId !== 'string'
      || typeof inline.text !== 'string'
      || inline.text.length === 0
    ) {
      issues.push(issue('READING_INLINE_INVALID', 'needs_review', `${path}[${index}]`, 'Reading stems and Options allow only closed literal text inlines'))
    }
  }
  return issues
}

function flattenedMarkerIssues(block, path) {
  if (richBlockInlineSets(block).flat().some((inline) => inline?.kind === 'text' && /\[(?:表|图)\s*:/u.test(inline.text))) {
    return [issue('READING_FLATTENED_BRIDGE_FORBIDDEN', 'incomplete_source', path, 'Flattened marker or placeholder text cannot qualify as canonical Reading')]
  }
  return []
}

function readingLeafBlockIssues(block, path, mediaById, mediaOccurrences, { allowFigure }) {
  const issues = flattenedMarkerIssues(block, path)
  if (block.kind === 'paragraph') {
    if (!Array.isArray(block.inlines) || block.inlines.length === 0) {
      issues.push(issue('READING_PARAGRAPH_INCOMPLETE', 'incomplete_source', path, 'Reading paragraphs cannot be empty'))
    }
    return issues
  }
  if (block.kind === 'table') {
    if (!Array.isArray(block.rows) || block.rows.length === 0) {
      issues.push(issue('READING_TABLE_INCOMPLETE', 'incomplete_source', path, 'Reading tables require captured rows and cells'))
    } else {
      const activeRowSpans = new Map()
      for (const row of block.rows) {
        const occupied = new Set(activeRowSpans.keys())
        let overlaps = false
        for (const cell of row?.cells || []) {
          for (let column = cell.columnStart; column < cell.columnStart + cell.columnSpan; column += 1) {
            if (occupied.has(column)) overlaps = true
            occupied.add(column)
            if (cell.rowSpan > 1) activeRowSpans.set(column, cell.rowSpan)
          }
        }
        if (!overlaps && occupied.size !== block.columnCount) {
          issues.push(issue('READING_TABLE_INCOMPLETE', 'incomplete_source', path, 'Reading tables cannot qualify with missing captured cells'))
          break
        }
        for (const [column, remaining] of [...activeRowSpans]) {
          if (remaining <= 1) activeRowSpans.delete(column)
          else activeRowSpans.set(column, remaining - 1)
        }
      }
      if (activeRowSpans.size > 0) issues.push(issue('READING_TABLE_INCOMPLETE', 'incomplete_source', path, 'Reading table row spans cannot exceed the final row'))
    }
    for (const [rowIndex, row] of (block.rows || []).entries()) {
      for (const [cellIndex, cell] of (row?.cells || []).entries()) {
        for (const [inlineIndex, inline] of (cell?.inlines || []).entries()) {
          if (inline?.kind !== 'media_ref') continue
          const inlinePath = `${path}.rows[${rowIndex}].cells[${cellIndex}].inlines[${inlineIndex}]`
          const mediaItem = mediaById.get(inline.mediaId)
          if (mediaOccurrences.has(inline.mediaId)) {
            mediaOccurrences.set(inline.mediaId, mediaOccurrences.get(inline.mediaId) + 1)
          }
          if (
            !mediaItem
            || !['image/png', 'image/jpeg', 'image/webp'].includes(mediaItem.mimeType)
            || typeof mediaItem.sha256 !== 'string'
            || !Number.isInteger(mediaItem.pixelWidth)
            || mediaItem.pixelWidth < 1
            || !Number.isInteger(mediaItem.pixelHeight)
            || mediaItem.pixelHeight < 1
            || typeof mediaItem.sourceArtifactRef?.artifactId !== 'string'
          ) {
            issues.push(issue('READING_TABLE_MEDIA_INCOMPLETE', 'incomplete_source', inlinePath, 'Reading table media refs require closed immutable media, dimensions, and source artifact identity'))
          }
        }
      }
    }
    return issues
  }
  if (block.kind === 'figure') {
    if (!allowFigure) {
      issues.push(issue('READING_FRAMED_COLUMNS_CHILD_UNSUPPORTED', 'unsupported', path, 'framed_columns children may only be paragraph or table'))
      return issues
    }
    const mediaItem = mediaById.get(block.mediaId)
    if (mediaOccurrences.has(block.mediaId)) mediaOccurrences.set(block.mediaId, mediaOccurrences.get(block.mediaId) + 1)
    if (
      !mediaItem
      || !['image/png', 'image/jpeg', 'image/webp'].includes(mediaItem.mimeType)
      || typeof mediaItem.sha256 !== 'string'
      || !Number.isInteger(mediaItem.pixelWidth)
      || mediaItem.pixelWidth < 1
      || !Number.isInteger(mediaItem.pixelHeight)
      || mediaItem.pixelHeight < 1
      || typeof mediaItem.sourceArtifactRef?.artifactId !== 'string'
    ) {
      issues.push(issue('READING_FIGURE_INCOMPLETE', 'incomplete_source', path, 'Reading Figures require closed immutable media, dimensions, and source artifact identity'))
    }
    return issues
  }
  issues.push(issue(
    allowFigure ? 'READING_BLOCK_INVALID' : 'READING_FRAMED_COLUMNS_CHILD_UNSUPPORTED',
    allowFigure ? 'needs_review' : 'unsupported',
    path,
    allowFigure
      ? 'Reading blocks must be closed rich-content objects'
      : 'framed_columns children may only be paragraph or table',
  ))
  return issues
}

function readingFramedColumnsIssues(block, path, mediaById, mediaOccurrences) {
  const issues = []
  if (
    block.columnCount !== FRAMED_COLUMNS_COLUMN_COUNT
    || !Array.isArray(block.columns)
    || block.columns.length !== FRAMED_COLUMNS_COLUMN_COUNT
  ) {
    issues.push(issue('READING_FRAMED_COLUMNS_INVALID', 'unsupported', path, 'framed_columns v1 requires exactly two columns'))
    return issues
  }
  for (const [columnIndex, column] of block.columns.entries()) {
    const columnPath = `${path}.columns[${columnIndex}]`
    if (!isRecordValue(column) || typeof column.columnId !== 'string' || !Array.isArray(column.blocks) || column.blocks.length === 0) {
      issues.push(issue('READING_FRAMED_COLUMNS_INVALID', 'needs_review', columnPath, 'framed_columns columns need identities and ordered child blocks'))
      continue
    }
    if (Object.hasOwn(column, 'questions') || column.blocks.some((child) => isQuestionLikeRichBlock(child))) {
      issues.push(issue('READING_FRAMED_COLUMNS_CHILD_UNSUPPORTED', 'unsupported', columnPath, 'Questions cannot live inside framed_columns'))
    }
    if (Object.hasOwn(column, 'columnHeading')) {
      const heading = framedColumnsHeadingBlock(column)
      if (!heading || heading.kind !== 'paragraph') {
        issues.push(issue('READING_FRAMED_COLUMNS_HEADING_INVALID', 'needs_review', `${columnPath}.columnHeading`, 'columnHeading must point at a paragraph in the same column'))
      }
    }
    issues.push(...readingContentBlockIssues(
      column.blocks,
      `${columnPath}.blocks`,
      mediaById,
      mediaOccurrences,
      { allowFramedColumns: false, allowFigure: false },
    ))
  }
  return issues
}

function readingContentBlockIssues(blocks, pathPrefix, mediaById, mediaOccurrences, {
  allowFramedColumns,
  allowFigure,
}) {
  const issues = []
  for (const [index, block] of (Array.isArray(blocks) ? blocks : []).entries()) {
    const path = `${pathPrefix}[${index}]`
    if (!isRecordValue(block)) {
      issues.push(issue('READING_BLOCK_INVALID', 'needs_review', path, 'Reading blocks must be closed rich-content objects'))
      continue
    }
    if (isFramedColumnsBlock(block)) {
      if (!allowFramedColumns) {
        issues.push(issue('READING_FRAMED_COLUMNS_CHILD_UNSUPPORTED', 'unsupported', path, 'framed_columns cannot nest'))
        continue
      }
      issues.push(...readingFramedColumnsIssues(block, path, mediaById, mediaOccurrences))
      continue
    }
    if (isQuestionLikeRichBlock(block) && block.kind !== 'paragraph' && block.kind !== 'table' && block.kind !== 'figure') {
      issues.push(issue(
        allowFramedColumns ? 'READING_BLOCK_INVALID' : 'READING_FRAMED_COLUMNS_CHILD_UNSUPPORTED',
        'unsupported',
        path,
        allowFramedColumns
          ? 'Reading Questions stay on the variant, not in passage content'
          : 'Questions cannot live inside framed_columns',
      ))
      continue
    }
    issues.push(...readingLeafBlockIssues(block, path, mediaById, mediaOccurrences, { allowFigure }))
  }
  return issues
}

function readingContentIssues(content, media, optionSets = [], questions = []) {
  const issues = []
  const mediaItems = Array.isArray(media) ? media : []
  const mediaById = new Map(mediaItems.map((item) => [item.mediaId, item]))
  const mediaOccurrences = new Map(mediaItems.map((item) => [item.mediaId, 0]))
  if (!Array.isArray(content?.blocks) || content.blocks.length === 0) {
    return [issue('READING_CONTENT_INCOMPLETE', 'incomplete_source', '$.content.blocks', 'Reading requires one ordered rich-content stream')]
  }
  issues.push(...readingContentBlockIssues(
    content.blocks,
    '$.content.blocks',
    mediaById,
    mediaOccurrences,
    { allowFramedColumns: true, allowFigure: true },
  ))
  for (const set of Array.isArray(optionSets) ? optionSets : []) {
    for (const option of Array.isArray(set?.options) ? set.options : []) {
      if (option?.figure && mediaOccurrences.has(option.figure.mediaId)) {
        mediaOccurrences.set(option.figure.mediaId, mediaOccurrences.get(option.figure.mediaId) + 1)
      }
    }
  }
  for (const [questionIndex, question] of (Array.isArray(questions) ? questions : []).entries()) {
    if (question?.stemFigures === undefined) continue
    const path = `$.variant.questions[${questionIndex}].stemFigures`
    if (!Array.isArray(question.stemFigures) || question.stemFigures.length === 0) {
      issues.push(issue('READING_STEM_FIGURES_INVALID', 'needs_review', path, 'Stem figures must be a nonempty ordered figure sequence'))
      continue
    }
    for (const [index, figure] of question.stemFigures.entries()) {
      if (!isRecordValue(figure) || !exactKeys(figure, ['kind', 'nodeId', 'mediaId', 'caption'])
        || figure.kind !== 'figure' || typeof figure.nodeId !== 'string' || !figure.nodeId
        || !Array.isArray(figure.caption) || figure.caption.length !== 0) {
        issues.push(issue('READING_STEM_FIGURE_INVALID', 'needs_review', `${path}[${index}]`, 'Stem figures require a closed source figure and empty caption'))
        continue
      }
      issues.push(...readingLeafBlockIssues(figure, `${path}[${index}]`, mediaById, mediaOccurrences, { allowFigure: true }))
    }
  }
  if ([...mediaOccurrences.values()].some((count) => count !== 1)) {
    issues.push(issue('READING_MEDIA_PLACEMENT_INVALID', 'needs_review', '$.media', 'Every Reading media entry must be placed exactly once by a passage Figure, table media ref, Question stem Figure, or option'))
  }
  return issues
}

function registerBlockSemanticIds(block, path, registerSemanticId) {
  registerSemanticId(block.nodeId, `${path}.nodeId`)
  if (block.kind === 'table') {
    for (const [rowIndex, row] of (block.rows || []).entries()) {
      if (!isRecordValue(row)) continue
      registerSemanticId(row.rowId, `${path}.rows[${rowIndex}].rowId`)
      for (const [cellIndex, cell] of (row.cells || []).entries()) {
        if (!isRecordValue(cell)) continue
        registerSemanticId(cell.cellId, `${path}.rows[${rowIndex}].cells[${cellIndex}].cellId`)
        for (const inline of cell.inlines || []) registerSemanticId(inline.nodeId, path)
      }
    }
    return
  }
  if (isFramedColumnsBlock(block)) {
    for (const [columnIndex, column] of (block.columns || []).entries()) {
      if (!isRecordValue(column)) continue
      registerSemanticId(column.columnId, `${path}.columns[${columnIndex}].columnId`)
      for (const [childIndex, child] of (column.blocks || []).entries()) {
        if (!isRecordValue(child)) continue
        registerBlockSemanticIds(child, `${path}.columns[${columnIndex}].blocks[${childIndex}]`, registerSemanticId)
      }
    }
    return
  }
  for (const inlines of richBlockInlineSets(block)) {
    for (const inline of inlines || []) registerSemanticId(inline.nodeId, path)
  }
}

export function validateReadingContract({
  questionIds,
  blankIds,
  content,
  media,
  variant,
  assertions,
  allowFigureOptions = false,
  allowStemMarks = false,
  allowOptionMarks = false,
  allowStemFigures = false,
}) {
  const issues = []
  if (blankIds.length !== 0) {
    issues.push(issue('READING_BLANKS_FORBIDDEN', 'needs_review', '$.blankRefs', 'Reading Questions do not own Blank identities'))
  }
  if (
    !isRecordValue(variant)
    || !exactKeys(variant, ['family', 'passageBlockRoles', 'questions', 'choiceOwnership'])
    || variant.family !== 'reading'
  ) {
    return [issue('READING_VARIANT_INVALID', 'needs_review', '$.variant', 'Reading variant fields are closed')]
  }
  const blocks = Array.isArray(content?.blocks) ? content.blocks : []
  issues.push(...readingContentIssues(content, media, variant.choiceOwnership?.sets, variant.questions))
  const semanticIds = new Set()
  function registerSemanticId(id, path) {
    if (typeof id !== 'string' || semanticIds.has(id)) {
      issues.push(issue('READING_IDENTITY_DUPLICATE', 'needs_review', path, 'Reading semantic identities must be non-empty and globally unique inside one Group'))
    }
    if (typeof id === 'string') semanticIds.add(id)
  }
  for (const [blockIndex, block] of blocks.entries()) {
    if (!isRecordValue(block)) continue
    registerBlockSemanticIds(block, `$.content.blocks[${blockIndex}]`, registerSemanticId)
  }

  const roles = variant.passageBlockRoles
  const resolvedRoles = resolvePassageBlockRoles(blocks, roles)
  if (!Array.isArray(roles)) {
    issues.push(issue('READING_ROLE_MAP_INVALID', 'needs_review', '$.variant.passageBlockRoles', 'Reading role membership must be ordered by node identity'))
  } else if (!resolvedRoles.ok) {
    const ambiguousTitle = roles.filter((entry) => entry?.role === 'title').length > 1
    issues.push(issue(
      ambiguousTitle ? 'READING_TITLE_AMBIGUOUS' : 'READING_ROLE_MAP_INVALID',
      'needs_review',
      '$.variant.passageBlockRoles',
      ambiguousTitle
        ? 'Reading admits at most one source-proven passage title'
        : 'Roles must uniquely reference paragraph blocks and serialize by nodeId',
    ))
  }

  const questions = variant.questions
  const sets = variant.choiceOwnership?.sets
  if (
    !Array.isArray(questions)
    || questions.length !== questionIds.length
    || questions.some((question, index) => question?.questionId !== questionIds[index])
  ) {
    issues.push(issue('READING_QUESTION_ORDER_INVALID', 'needs_review', '$.variant.questions', 'Reading Question order must exactly equal questionRefs'))
  }
  if (
    !isRecordValue(variant.choiceOwnership)
    || !exactKeys(variant.choiceOwnership, ['ownership', 'sets'])
    || variant.choiceOwnership.ownership !== 'per_question'
    || !Array.isArray(sets)
    || sets.length !== questionIds.length
    || sets.some((set, index) => set?.questionId !== questionIds[index])
  ) {
    issues.push(issue('READING_OPTION_OWNERSHIP_INVALID', 'needs_review', '$.variant.choiceOwnership', 'Reading requires one ordered Question-owned A-D set per Question'))
  }

  const officialByQuestion = new Map()
  for (const assertion of assertions.filter((item) => item.authority === 'official' && questionIds.includes(item.questionId))) {
    const values = officialByQuestion.get(assertion.questionId) || []
    values.push(assertion)
    officialByQuestion.set(assertion.questionId, values)
  }
  for (const [index, questionId] of questionIds.entries()) {
    const question = questions?.[index]
    const set = sets?.[index]
    if (
      !isRecordValue(question)
      || !exactKeys(question, ['questionId', 'stem', 'correctOptionId',
        ...(allowFigureOptions && Object.hasOwn(question, 'figureLayout') ? ['figureLayout'] : []),
        ...(allowStemFigures && Object.hasOwn(question, 'stemFigures') ? ['stemFigures'] : []),
      ])
      || typeof question.correctOptionId !== 'string'
    ) {
      issues.push(issue('READING_QUESTION_INVALID', 'needs_review', `$.variant.questions[${index}]`, 'Reading Questions require a closed stem and correct Option join'))
      continue
    }
    issues.push(...literalInlineIssues(question.stem, `$.variant.questions[${index}].stem`, allowStemMarks))
    for (const inline of question.stem || []) {
      registerSemanticId(inline.nodeId, `$.variant.questions[${index}].stem`)
    }
    for (const figure of Array.isArray(question.stemFigures) ? question.stemFigures : []) {
      if (isRecordValue(figure) && figure.kind === 'figure' && Array.isArray(figure.caption)) {
        registerBlockSemanticIds(figure, `$.variant.questions[${index}].stemFigures`, registerSemanticId)
      }
    }
    const options = set?.options
    if (
      !isRecordValue(set)
      || !exactKeys(set, ['questionId', 'options'])
      || !Array.isArray(options)
      || options.length !== 4
      || options.map((option) => option?.label).join('') !== 'ABCD'
      || new Set(options.map((option) => option?.optionId)).size !== 4
    ) {
      issues.push(issue('READING_OPTION_SET_INVALID', 'needs_review', `$.variant.choiceOwnership.sets[${index}]`, 'Reading Options must be one exact ordered A-D set'))
      continue
    }
    const figureMode = allowFigureOptions && options.every((option) => option?.figure)
    if (Object.hasOwn(question, 'figureLayout')
      && !validateReadingFigureLayout(question.figureLayout, questionId, options)) {
      issues.push(issue('READING_FIGURE_LAYOUT_INVALID', 'needs_review', `$.variant.questions[${index}]`, 'Source-measured layout must preserve its exact digest and A-D geometry'))
    }
    for (const [optionIndex, option] of options.entries()) {
      if (figureMode) {
        const image = (media || []).find((item) => item.mediaId === option.figure.mediaId)
        if (!exactKeys(option, ['optionId', 'label', 'figure'])
          || typeof option.optionId !== 'string' || !isRecordValue(option.figure)
          || !exactKeys(option.figure, ['mediaId']) || !image
          || !['image/png', 'image/jpeg', 'image/webp'].includes(image.mimeType)) {
          issues.push(issue('READING_FIGURE_OPTION_INVALID', 'needs_review', `$.variant.choiceOwnership.sets[${index}].options[${optionIndex}]`, 'Figure option must reference one same-group immutable raster image'))
        } else {
          registerSemanticId(option.optionId, `$.variant.choiceOwnership.sets[${index}].options[${optionIndex}]`)
        }
      } else if (!isRecordValue(option) || !exactKeys(option, ['optionId', 'label', 'content']) || typeof option.optionId !== 'string') {
        issues.push(issue('READING_OPTION_INVALID', 'needs_review', `$.variant.choiceOwnership.sets[${index}].options[${optionIndex}]`, 'Reading Option fields are closed'))
      } else {
        registerSemanticId(option.optionId, `$.variant.choiceOwnership.sets[${index}].options[${optionIndex}]`)
        issues.push(...literalInlineIssues(option.content, `$.variant.choiceOwnership.sets[${index}].options[${optionIndex}].content`, allowOptionMarks))
        for (const inline of option.content || []) {
          registerSemanticId(inline.nodeId, `$.variant.choiceOwnership.sets[${index}].options[${optionIndex}].content`)
        }
      }
    }
    const correct = options.find((option) => option.optionId === question.correctOptionId)
    const official = officialByQuestion.get(questionId) || []
    if (official.length !== 1) {
      issues.push(issue('READING_ANSWER_EVIDENCE_INCOMPLETE', 'incomplete_source', `$.variant.questions[${index}]`, 'Reading requires exactly one official answer assertion'))
    } else if (!correct || correct.label !== official[0].answer) {
      issues.push(issue('READING_ANSWER_JOIN_INVALID', 'answer_conflict', `$.variant.questions[${index}].correctOptionId`, 'Official Reading answer does not join the selected A-D Option identity'))
    }
  }
  return issues
}
