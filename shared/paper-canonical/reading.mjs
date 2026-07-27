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

function readingContentIssues(content, media) {
  const issues = []
  const mediaById = new Map(media.map((item) => [item.mediaId, item]))
  if (!Array.isArray(content?.blocks) || content.blocks.length === 0) {
    return [issue('READING_CONTENT_INCOMPLETE', 'incomplete_source', '$.content.blocks', 'Reading requires one ordered rich-content stream')]
  }
  for (const [index, block] of content.blocks.entries()) {
    const path = `$.content.blocks[${index}]`
    const inlineSets = block.kind === 'table'
      ? (block.rows || []).flatMap((row) => (row.cells || []).map((cell) => cell.inlines))
      : [block.kind === 'figure' ? block.caption : block.inlines]
    if (inlineSets.flat().some((inline) => inline?.kind === 'text' && /\[(?:表|图)\s*:/u.test(inline.text))) {
      issues.push(issue('READING_FLATTENED_BRIDGE_FORBIDDEN', 'incomplete_source', path, 'Flattened marker or placeholder text cannot qualify as canonical Reading'))
    }
    if (block.kind === 'paragraph') {
      if (!Array.isArray(block.inlines) || block.inlines.length === 0) {
        issues.push(issue('READING_PARAGRAPH_INCOMPLETE', 'incomplete_source', path, 'Reading paragraphs cannot be empty'))
      }
      continue
    }
    if (block.kind === 'table') {
      if (!Array.isArray(block.rows) || block.rows.length === 0) {
        issues.push(issue('READING_TABLE_INCOMPLETE', 'incomplete_source', path, 'Reading tables require captured rows and cells'))
      } else if (block.rows.some((row) => !Array.isArray(row?.cells) || row.cells.reduce((total, cell) => total + (Number.isInteger(cell?.columnSpan) ? cell.columnSpan : 0), 0) < block.columnCount)) {
        issues.push(issue('READING_TABLE_INCOMPLETE', 'incomplete_source', path, 'Reading tables cannot qualify with missing captured cells'))
      }
      continue
    }
    if (block.kind === 'figure') {
      const mediaItem = mediaById.get(block.mediaId)
      if (
        !mediaItem
        || typeof mediaItem.sha256 !== 'string'
        || !Number.isInteger(mediaItem.pixelWidth)
        || mediaItem.pixelWidth < 1
        || !Number.isInteger(mediaItem.pixelHeight)
        || mediaItem.pixelHeight < 1
        || typeof mediaItem.sourceArtifactRef?.artifactId !== 'string'
      ) {
        issues.push(issue('READING_FIGURE_INCOMPLETE', 'incomplete_source', path, 'Reading Figures require closed immutable media, dimensions, and source artifact identity'))
      }
    }
  }
  return issues
}

export function validateReadingContract({
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
  issues.push(...readingContentIssues(content, media))
  const semanticIds = new Set()
  for (const block of content.blocks) {
    semanticIds.add(block.nodeId)
    const inlineSets = block.kind === 'table'
      ? (block.rows || []).flatMap((row) => {
          semanticIds.add(row.rowId)
          return (row.cells || []).map((cell) => {
            semanticIds.add(cell.cellId)
            return cell.inlines
          })
        })
      : [block.kind === 'figure' ? block.caption : block.inlines]
    for (const inlines of inlineSets) for (const inline of inlines || []) semanticIds.add(inline.nodeId)
  }

  const paragraphIds = new Set(content.blocks.filter((block) => block.kind === 'paragraph').map((block) => block.nodeId))
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
      if (semanticIds.has(inline.nodeId)) issues.push(issue('READING_IDENTITY_DUPLICATE', 'needs_review', `$.variant.questions[${index}].stem`, 'Reading semantic identities must be globally unique inside one Group'))
      semanticIds.add(inline.nodeId)
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
    for (const [optionIndex, option] of options.entries()) {
      if (!isRecordValue(option) || !exactKeys(option, ['optionId', 'label', 'content']) || typeof option.optionId !== 'string') {
        issues.push(issue('READING_OPTION_INVALID', 'needs_review', `$.variant.choiceOwnership.sets[${index}].options[${optionIndex}]`, 'Reading Option fields are closed'))
      } else {
        if (semanticIds.has(option.optionId)) issues.push(issue('READING_IDENTITY_DUPLICATE', 'needs_review', `$.variant.choiceOwnership.sets[${index}].options[${optionIndex}]`, 'Reading semantic identities must be globally unique inside one Group'))
        semanticIds.add(option.optionId)
        issues.push(...literalInlineIssues(option.content, `$.variant.choiceOwnership.sets[${index}].options[${optionIndex}].content`))
        for (const inline of option.content || []) {
          if (semanticIds.has(inline.nodeId)) issues.push(issue('READING_IDENTITY_DUPLICATE', 'needs_review', `$.variant.choiceOwnership.sets[${index}].options[${optionIndex}].content`, 'Reading semantic identities must be globally unique inside one Group'))
          semanticIds.add(inline.nodeId)
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
