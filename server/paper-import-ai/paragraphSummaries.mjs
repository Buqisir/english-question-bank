const SUMMARY_FAMILIES = new Set([
  'reading',
  'seven-choices',
  'cloze',
  'grammar-fill',
  'continuation-writing',
])

function paragraphText(block) {
  return block.content
    .filter((item) => item.kind === 'text')
    .map((item) => item.text)
    .join('')
}

function paragraphsIn(blocks, headingIds = new Set()) {
  return blocks.flatMap((block) => {
    if (block.kind === 'framed_columns') {
      return block.columns.flatMap((column) => paragraphsIn(
        column.blocks,
        new Set(column.headingBlockId ? [column.headingBlockId] : []),
      ))
    }
    return block.kind === 'paragraph'
      && block.role === 'body'
      && !headingIds.has(block.blockId)
      ? [block]
      : []
  })
}

function continuationMaterialParagraphs(group) {
  const blocks = group.blocks || []
  const material = group.writingTask?.material
  if (!Array.isArray(material)) {
    throw new Error(`SUMMARY_CONTINUATION_STRUCTURE_AMBIGUOUS: ${group.groupId} has no material sequence`)
  }
  // The DOCX adapter emits prompt, then each source material item, then the
  // notice and supplied starters. Bind by those structural positions rather
  // than text membership: source prose and a starter may legitimately match.
  const selected = blocks.slice(1, material.length + 1)
  if (
    selected.length !== material.length
    || selected.some((block, index) =>
      block.kind !== 'paragraph'
      || !['body', 'title', 'subtitle'].includes(block.role)
      || paragraphText(block) !== material[index])
  ) {
    throw new Error(
      `SUMMARY_CONTINUATION_STRUCTURE_AMBIGUOUS: ${group.groupId} material blocks do not match adapter positions`,
    )
  }
  return selected.filter((block) => block.role === 'body')
}

/**
 * Enumerates only source-identified prose paragraphs. Listening is deliberately
 * excluded in v1: its transcript segments are scripts, not materialization
 * paragraph blocks. Writing instructions and supplied continuation starters
 * are also excluded.
 */
export function enumerateParagraphSummaryTargets(materialization) {
  const targets = []
  for (const group of materialization.groups || []) {
    if (!SUMMARY_FAMILIES.has(group.family)) continue
    let paragraphs = paragraphsIn(group.blocks || [])
    if (group.family === 'continuation-writing') {
      paragraphs = continuationMaterialParagraphs(group)
    }
    for (const block of paragraphs) {
      targets.push({
        groupId: group.groupId,
        paragraphId: block.blockId,
        content: structuredClone(block.content),
      })
    }
  }
  return targets
}

function issue(code, path, message) {
  return { code, path, message }
}

function hasExactKeys(value, keys) {
  return value && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key))
}

/** Strictly checks identity and exact, once-only target coverage. */
export function validateParagraphSummaries({
  sidecar,
  materialization,
  sourceDigest,
  candidateDigest,
}) {
  const issues = []
  if (!hasExactKeys(sidecar, ['schemaVersion', 'paperId', 'sourceDigest', 'candidateDigest', 'groups'])) {
    issues.push(issue('SUMMARY_SIDECAR_SHAPE_INVALID', '$', 'Sidecar fields are closed'))
  }
  if (sidecar?.schemaVersion !== 'paragraph-summaries-v1') {
    issues.push(issue('SUMMARY_SCHEMA_VERSION_INVALID', '$.schemaVersion', 'Expected paragraph-summaries-v1'))
  }
  for (const [key, expected] of [
    ['paperId', materialization?.paperId],
    ['sourceDigest', sourceDigest],
    ['candidateDigest', candidateDigest],
  ]) {
    if (sidecar?.[key] !== expected) {
      issues.push(issue('SUMMARY_BINDING_STALE', `$.${key}`, `${key} does not match the materialized candidate`))
    }
  }

  const targets = enumerateParagraphSummaryTargets(materialization || {})
  const targetById = new Map(targets.map((target) => [target.paragraphId, target]))
  const targetGroupIds = new Set(targets.map((target) => target.groupId))
  const seenGroups = new Set()
  const seenParagraphs = new Set()
  if (!Array.isArray(sidecar?.groups)) {
    issues.push(issue('SUMMARY_GROUPS_INVALID', '$.groups', 'groups must be an array'))
    return issues
  }
  for (const [groupIndex, group] of sidecar.groups.entries()) {
    const groupPath = `$.groups[${groupIndex}]`
    if (!hasExactKeys(group, ['groupId', 'paragraphs'])) {
      issues.push(issue('SUMMARY_GROUP_SHAPE_INVALID', groupPath, 'Group fields are closed'))
    }
    if (!targetGroupIds.has(group?.groupId)) {
      issues.push(issue('SUMMARY_GROUP_FOREIGN', `${groupPath}.groupId`, 'groupId has no summary targets'))
    }
    if (seenGroups.has(group?.groupId)) {
      issues.push(issue('SUMMARY_GROUP_DUPLICATE', `${groupPath}.groupId`, 'groupId must occur once'))
    }
    seenGroups.add(group?.groupId)
    if (!Array.isArray(group?.paragraphs)) {
      issues.push(issue('SUMMARY_PARAGRAPHS_INVALID', `${groupPath}.paragraphs`, 'paragraphs must be an array'))
      continue
    }
    for (const [paragraphIndex, paragraph] of group.paragraphs.entries()) {
      const paragraphPath = `${groupPath}.paragraphs[${paragraphIndex}]`
      if (!hasExactKeys(paragraph, ['paragraphId', 'summary'])) {
        issues.push(issue('SUMMARY_PARAGRAPH_SHAPE_INVALID', paragraphPath, 'Paragraph summary fields are closed'))
      }
      const target = targetById.get(paragraph?.paragraphId)
      if (!target) {
        issues.push(issue('SUMMARY_PARAGRAPH_FOREIGN', `${paragraphPath}.paragraphId`, 'paragraphId is not a summary target'))
      } else if (target.groupId !== group.groupId) {
        issues.push(issue('SUMMARY_GROUP_MISMATCH', `${paragraphPath}.paragraphId`, 'paragraphId belongs to another group'))
      }
      if (seenParagraphs.has(paragraph?.paragraphId)) {
        issues.push(issue('SUMMARY_PARAGRAPH_DUPLICATE', `${paragraphPath}.paragraphId`, 'paragraphId must occur once'))
      }
      seenParagraphs.add(paragraph?.paragraphId)
      if (typeof paragraph?.summary !== 'string' || !paragraph.summary.trim()) {
        issues.push(issue('SUMMARY_TEXT_EMPTY', `${paragraphPath}.summary`, 'summary must contain non-whitespace text'))
      }
    }
  }
  for (const target of targets) {
    if (!seenParagraphs.has(target.paragraphId)) {
      issues.push(issue('SUMMARY_PARAGRAPH_MISSING', '$.groups', `Missing summary for ${target.groupId}/${target.paragraphId}`))
    }
  }
  return issues
}
