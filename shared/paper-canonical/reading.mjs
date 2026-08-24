import {
  FRAMED_COLUMNS_COLUMN_COUNT,
  framedColumnsHeadingBlock,
  isFramedColumnsBlock,
  isQuestionLikeRichBlock,
  richBlockInlineSets,
} from './richContent.mjs'
import { exactKeys, isRecordValue } from './stable.mjs'

function issue(code, disposition, path, message) {
  return { code, disposition, path, message }
}

function literalInlineIssues(inlines, path) {
  if (!Array.isArray(inlines) || inlines.length === 0) {
    return [issue('READING_INLINE_INCOMPLETE', 'incomplete_source', path, 'Reading literal content requires at least one inline')]
  }
  const issues = []
  for (const [index, inline] of inlines.entries()) {
    if (
      !isRecordValue(inline)
      || !exactKeys(inline, ['kind', 'nodeId', 'text'])
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
    } else if (block.rows.some((row) => !Array.isArray(row?.cells) || row.cells.reduce((total, cell) => total + (Number.isInteger(cell?.columnSpan) ? cell.columnSpan : 0), 0) < block.columnCount)) {
      issues.push(issue('READING_TABLE_INCOMPLETE', 'incomplete_source', path, 'Reading tables cannot qualify with missing captured cells'))
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

function readingContentIssues(content, media, {
  deferMediaClosure = false,
  mediaById = new Map((Array.isArray(media) ? media : []).map((item) => [item.mediaId, item])),
  mediaOccurrences = new Map((Array.isArray(media) ? media : []).map((item) => [item.mediaId, 0])),
} = {}) {
  const issues = []
  const mediaItems = Array.isArray(media) ? media : []
  if (new Set(mediaItems.map((item) => item?.mediaId)).size !== mediaItems.length) {
    issues.push(issue('READING_MEDIA_ID_DUPLICATE', 'needs_review', '$.media', 'Reading media identities must be unique inside one Group'))
  }
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
  if (!deferMediaClosure && [...mediaOccurrences.values()].some((count) => count !== 1)) {
    issues.push(issue('READING_MEDIA_PLACEMENT_INVALID', 'needs_review', '$.media', 'Every Reading media entry must be placed by exactly one Figure block'))
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
  familyVersion = '1',
  questionIds,
  blankIds,
  content,
  media,
  variant,
  assertions,
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
  const mediaItems = Array.isArray(media) ? media : []
  const mediaById = new Map(mediaItems.map((item) => [item.mediaId, item]))
  const mediaOccurrences = new Map(mediaItems.map((item) => [item.mediaId, 0]))
  const optionFigureSuccessor = familyVersion === '2'
  if (
    optionFigureSuccessor
    && mediaItems.some((item) => typeof item?.mediaId !== 'string' || item.mediaId.length === 0)
  ) {
    issues.push(issue('READING_MEDIA_ID_INVALID', 'needs_review', '$.media', 'Reading v2 media identities must be non-empty strings'))
  }
  issues.push(...readingContentIssues(content, media, {
    deferMediaClosure: optionFigureSuccessor,
    mediaById,
    mediaOccurrences,
  }))
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

  const paragraphIds = new Set(blocks.filter((block) => block?.kind === 'paragraph').map((block) => block.nodeId))
  const roles = variant.passageBlockRoles
  if (!Array.isArray(roles)) {
    issues.push(issue('READING_ROLE_MAP_INVALID', 'needs_review', '$.variant.passageBlockRoles', 'Reading role membership must be ordered by node identity'))
  } else {
    const roleIds = roles.map((entry) => entry?.nodeId)
    if (
      roles.some((entry) => !isRecordValue(entry) || !exactKeys(entry, ['nodeId', 'role']) || !paragraphIds.has(entry.nodeId) || !['title', 'subtitle'].includes(entry.role))
      || new Set(roleIds).size !== roleIds.length
      || roleIds.some((nodeId, index) => index > 0 && nodeId.localeCompare(roleIds[index - 1]) < 0)
    ) {
      issues.push(issue('READING_ROLE_MAP_INVALID', 'needs_review', '$.variant.passageBlockRoles', 'Roles must uniquely reference paragraph blocks and serialize by nodeId'))
    }
    if (roles.filter((entry) => entry?.role === 'title').length > 1) {
      issues.push(issue('READING_TITLE_AMBIGUOUS', 'needs_review', '$.variant.passageBlockRoles', 'Reading admits at most one source-proven passage title'))
    }
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
      || !exactKeys(question, ['questionId', 'stem', 'correctOptionId'])
      || typeof question.correctOptionId !== 'string'
    ) {
      issues.push(issue('READING_QUESTION_INVALID', 'needs_review', `$.variant.questions[${index}]`, 'Reading Questions require a closed stem and correct Option join'))
      continue
    }
    issues.push(...literalInlineIssues(question.stem, `$.variant.questions[${index}].stem`))
    for (const inline of question.stem || []) {
      registerSemanticId(inline.nodeId, `$.variant.questions[${index}].stem`)
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
    const optionModes = new Set(options.map((option) => (
      isRecordValue(option) && Object.hasOwn(option, 'figure') ? 'figure' : 'text'
    )))
    if (optionFigureSuccessor && optionModes.size !== 1) {
      issues.push(issue('READING_OPTION_MODE_MIXED', 'needs_review', `$.variant.choiceOwnership.sets[${index}].options`, 'One Reading Question must use one homogeneous text or Figure Option mode'))
    }
    for (const [optionIndex, option] of options.entries()) {
      const optionPath = `$.variant.choiceOwnership.sets[${index}].options[${optionIndex}]`
      const figureOption = optionFigureSuccessor && optionModes.size === 1 && optionModes.has('figure')
      const expectedKeys = figureOption
        ? ['optionId', 'label', 'figure']
        : ['optionId', 'label', 'content']
      if (
        !isRecordValue(option)
        || !exactKeys(option, expectedKeys)
        || typeof option.optionId !== 'string'
        || (optionFigureSuccessor && option.optionId.length === 0)
      ) {
        issues.push(issue('READING_OPTION_INVALID', 'needs_review', `$.variant.choiceOwnership.sets[${index}].options[${optionIndex}]`, 'Reading Option fields are closed'))
      } else {
        registerSemanticId(option.optionId, optionPath)
        if (figureOption) {
          const mediaItem = mediaById.get(option.figure?.mediaId)
          if (
            !isRecordValue(option.figure)
            || !exactKeys(option.figure, ['mediaId'])
            || typeof option.figure.mediaId !== 'string'
            || option.figure.mediaId.length === 0
            || !mediaItem
            || mediaItem.mimeType !== 'image/png'
            || typeof mediaItem.sha256 !== 'string'
            || !Number.isInteger(mediaItem.pixelWidth)
            || mediaItem.pixelWidth < 1
            || !Number.isInteger(mediaItem.pixelHeight)
            || mediaItem.pixelHeight < 1
            || typeof mediaItem.sourceArtifactRef?.artifactId !== 'string'
          ) {
            issues.push(issue('READING_OPTION_FIGURE_INVALID', 'incomplete_source', `${optionPath}.figure`, 'Reading Figure Options require one closed immutable PNG media identity'))
          }
          if (mediaOccurrences.has(option.figure?.mediaId)) {
            mediaOccurrences.set(option.figure.mediaId, mediaOccurrences.get(option.figure.mediaId) + 1)
          }
        } else {
          issues.push(...literalInlineIssues(option.content, `${optionPath}.content`))
          if (
            optionFigureSuccessor
            && Array.isArray(option.content)
            && option.content.every((inline) => inline?.kind === 'text')
            && option.content.map((inline) => inline.text || '').join('').trim().length === 0
          ) {
            issues.push(issue('READING_OPTION_TEXT_EMPTY', 'incomplete_source', `${optionPath}.content`, 'Reading text Options must contain non-whitespace literal text'))
          }
          if ((option.content || []).some((inline) =>
            inline?.kind === 'text'
            && typeof inline.text === 'string'
            && /^\[\s*fig(?:ure)?\.?\s*\]$/iu.test(inline.text.trim()))) {
            issues.push(issue('READING_OPTION_FIGURE_PLACEHOLDER_FORBIDDEN', 'incomplete_source', `${optionPath}.content`, 'Figure placeholders cannot qualify as literal Reading Options'))
          }
          for (const inline of option.content || []) {
            registerSemanticId(inline.nodeId, `${optionPath}.content`)
          }
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
  if (optionFigureSuccessor && [...mediaOccurrences.values()].some((count) => count !== 1)) {
    issues.push(issue('READING_MEDIA_PLACEMENT_INVALID', 'needs_review', '$.media', 'Every Reading media entry must be placed exactly once by a passage or Option Figure'))
  }
  return issues
}
