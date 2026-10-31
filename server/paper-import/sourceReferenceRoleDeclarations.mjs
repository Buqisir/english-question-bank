// Optional per-paper writing role declarations. A declaration file
// (imports/ocr-proofread/<paperId>/source-reference-roles.json) records
// agent-reviewed source heading roles that the closed regex grammar cannot
// recognize: a bare 【参考范文】, a second 第一节/第二节 scoring pair, or a
// typed "应用文 Sample Writing:" label. The artifact embeds a copy under
// `writingRoleDeclarations` so replayed admission consumes the sealed record.
import { SOURCE_REFERENCE_ANSWER_ROLES } from './sourceReferenceWritingRules.mjs'

export const WRITING_ROLE_DECLARATIONS_SCHEMA_VERSION = 'source-reference-roles-v1'
export const WRITING_ROLES = Object.freeze(['section-heading', 'sample-heading', 'scoring-heading', 'commentary', 'not-writing'])
export const WRITING_TASK_TYPES = Object.freeze(['application', 'continuation'])

export function roleDeclarationError(message) {
  return Object.assign(new Error(message), { code: 'SOURCE_REFERENCE_ROLE_DECLARATION_INVALID' })
}

// Validate the raw declaration list against the confirmed answer document and
// the materialized writing tasks. Pure data checks only; state transitions are
// applied by the lifecycle and capture planner.
export function validateWritingRoleDeclarations(input, { materialization, confirmation }) {
  if (input === undefined || input === null) return []
  const entries = Array.isArray(input) ? input : input?.entries ?? input?.declarations
  if (!Array.isArray(entries)) {
    throw roleDeclarationError('writingRoleDeclarations must be an array')
  }
  const taskTypes = new Set((materialization.groups ?? [])
    .map(group => group.writingTask?.taskType).filter(Boolean))
  const answerIds = new Set((materialization.documents ?? [])
    .filter(document => SOURCE_REFERENCE_ANSWER_ROLES.includes(document.role))
    .map(document => document.documentId))
  const items = new Map()
  for (const document of confirmation.documents ?? []) {
    if (!answerIds.has(document.documentId)) continue
    for (const [pageIndex, page] of document.pages.entries()) {
      const pageNumber = page.page ?? pageIndex + 1
      for (const item of page.orderedItems ?? []) {
        items.set(item.itemId, { item, page: pageNumber })
      }
    }
  }
  const seen = new Map()
  return entries.map((entry, index) => {
    const where = `writingRoleDeclarations[${index}]`
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw roleDeclarationError(`${where} must be an object`)
    }
    const { itemId, page, quote, role, taskType, reason } = entry
    if (typeof itemId !== 'string' || !items.has(itemId)) {
      throw roleDeclarationError(`${where}.itemId does not name a confirmed answer-document item`)
    }
    const { item, page: itemPage } = items.get(itemId)
    if (!Number.isInteger(page) || page !== itemPage) {
      throw roleDeclarationError(`${where}.page ${JSON.stringify(page)} differs from the confirmed page ${itemPage} of ${itemId}`)
    }
    if (quote !== item.text) {
      throw roleDeclarationError(`${where}.quote must equal the confirmed item text exactly`)
    }
    if (!WRITING_ROLES.includes(role)) {
      throw roleDeclarationError(`${where}.role must be one of ${WRITING_ROLES.join(', ')}`)
    }
    if (role !== 'not-writing' && !WRITING_TASK_TYPES.includes(taskType)) {
      throw roleDeclarationError(`${where}.taskType must be application or continuation for role ${role}`)
    }
    if (role === 'not-writing' && taskType !== undefined && !WRITING_TASK_TYPES.includes(taskType)) {
      throw roleDeclarationError(`${where}.taskType must be application or continuation`)
    }
    if (taskType !== undefined && !taskTypes.has(taskType)) {
      throw roleDeclarationError(`${where}.taskType ${taskType} does not name a materialized writing task`)
    }
    if (typeof reason !== 'string' || !/\S/u.test(reason)) {
      throw roleDeclarationError(`${where}.reason must describe the source basis`)
    }
    const previous = seen.get(itemId)
    if (previous) {
      const same = previous.role === role && previous.taskType === (taskType ?? null)
      throw roleDeclarationError(same
        ? `${where} repeats the declaration for ${itemId}`
        : `${where} conflicts with the earlier ${previous.role} declaration for ${itemId}`)
    }
    seen.set(itemId, { role, taskType: taskType ?? null })
    return { itemId, page, quote, role, taskType: taskType ?? null, reason }
  })
}

// Group validated declarations by item for lifecycle consumption. Returns a
// Map<itemId, declaration> plus the ordered list; the map holds one entry per
// item because validation already rejected repeats and conflicts.
export function resolveWritingRoleDeclarations(declarations) {
  const byItemId = new Map()
  for (const declaration of declarations ?? []) byItemId.set(declaration.itemId, declaration)
  const declaredStarts = new Map()
  const declaredSamples = new Map()
  const declaredScorings = new Map()
  const declaredCommentary = new Map()
  const excluded = new Set()
  for (const declaration of declarations ?? []) {
    if (declaration.role === 'section-heading') declaredStarts.set(declaration.itemId, declaration.taskType)
    else if (declaration.role === 'sample-heading') declaredSamples.set(declaration.itemId, declaration.taskType)
    else if (declaration.role === 'scoring-heading') declaredScorings.set(declaration.itemId, declaration.taskType)
    else if (declaration.role === 'commentary') declaredCommentary.set(declaration.itemId, declaration.taskType)
    else if (declaration.role === 'not-writing') excluded.add(declaration.itemId)
  }
  return { declarations: declarations ?? [], byItemId, declaredStarts, declaredSamples, declaredScorings,
    declaredCommentary, excluded }
}
