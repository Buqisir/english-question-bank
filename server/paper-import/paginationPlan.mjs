import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { digestJson } from '../../shared/paper-canonical/stable.mjs'
import { FIXED_PAGE_COVER_GAPS_PT, validateAnswerBoxHeights } from '../draft-paper/fixedPagePdfPlanner.mjs'
import { STUDENT_PRODUCT_EDITIONS, studentProductPolicy, validateStudentProductLayout } from '../draft-paper/studentProductPdf.mjs'

export const PAPER_PAGINATION_PLAN_FILE_NAME = 'pagination-plan.json'
export const FIXED_PAGINATION_EDITIONS = ['friendly8', 'friendly10', 'long10', 'long12', ...STUDENT_PRODUCT_EDITIONS]

// Only a source/Candidate-bound v5 plan opts this paper into the nine-page
// ceiling. Absent and historical plans retain the exact eight-page policy.
export function economyPageLimitForPlan(plan) {
  return plan?.schemaVersion === 'paper-pagination-plan-v5' ? 9 : 8
}

function invalid(message) {
  throw Object.assign(new Error(`Pagination plan is invalid: ${message}`), {
    code: 'PAPER_PAGINATION_PLAN_INVALID',
  })
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')) {
    invalid(`${label} has unknown or missing fields`)
  }
}

export function validatePaperPaginationPlan(plan, {
  paperId,
  sourceDigest,
  candidateDigest,
  slotBindings,
  sourceHasListening,
} = {}) {
  exactKeys(plan, ['schemaVersion', 'paperId', 'sourceDigest', 'candidateDigest', 'editions'], 'root')
  if (!['paper-pagination-plan-v1', 'paper-pagination-plan-v2', 'paper-pagination-plan-v4', 'paper-pagination-plan-v5'].includes(plan.schemaVersion)) invalid('schemaVersion is unsupported')
  if (plan.paperId !== paperId || plan.sourceDigest !== sourceDigest
    || plan.candidateDigest !== candidateDigest) invalid('source or Candidate identity is stale')
  exactKeys(plan.editions, Object.keys(plan.editions), 'editions')
  if (Object.keys(plan.editions).length === 0) invalid('at least one edition is required')
  const economyPageLimit = economyPageLimitForPlan(plan)
  if (economyPageLimit === 9 && !plan.editions.economy8) invalid('v5 requires an explicit economy8 edition')
  const bindingBySlot = new Map(slotBindings.map((entry) => [entry.slotId, entry]))
  const listeningSlotCount = slotBindings.filter((entry) =>
    entry.familyContractId === 'listening').length
  const order = new Map(slotBindings.map((entry, index) => [entry.slotId, index]))
  for (const edition of Object.keys(plan.editions)) {
    if (!FIXED_PAGINATION_EDITIONS.includes(edition)) invalid(`unknown edition ${edition}`)
    if (plan.schemaVersion === 'paper-pagination-plan-v1' && edition.startsWith('long')) {
      invalid(`${edition} requires paper-pagination-plan-v2`)
    }
    const entry = plan.editions[edition]
    const product = STUDENT_PRODUCT_EDITIONS.includes(edition)
    if (product) {
      if (!['paper-pagination-plan-v4', 'paper-pagination-plan-v5'].includes(plan.schemaVersion)) invalid(`${edition} requires paper-pagination-plan-v4 or v5`)
      try { validateStudentProductLayout(entry?.layout, edition) } catch (error) { invalid(error.message) }
      if (edition === 'economy8' && economyPageLimit === 9 && (entry.layout.fontSizePt !== 10.5
        || entry.layout.profile !== 'student-friendly-economy-v2')) invalid('nine-page economy must retain its 10.5pt economy-v2 layout')
      if (entry.allowSplitOptionBank !== false || entry.omitCover !== false || entry.coverGapsPt !== null
        || Object.hasOwn(entry, 'answerBoxHeightsMm')) invalid(`${edition} product policy was changed`)
    } else if (Object.hasOwn(entry || {}, 'layout')) invalid(`${edition} cannot adopt a new product layout`)
    const entryKeys = Object.keys(entry || {}).filter(key => key !== 'answerBoxHeightsMm' && key !== 'layout').sort().join('\0')
    const legacyKeys = ['targetPages', 'includeListening', 'omitCover', 'coverGapsPt', 'breakSlotIds']
      .sort().join('\0')
    const currentKeys = [
      'targetPages', 'includeListening', 'omitCover', 'coverGapsPt', 'breakSlotIds',
      'allowSplitOptionBank',
    ].sort().join('\0')
    if (entryKeys !== legacyKeys && entryKeys !== currentKeys) {
      invalid(`${edition} has unknown or missing fields`)
    }
    if (Object.hasOwn(entry, 'answerBoxHeightsMm')) {
      if (edition.startsWith('long')) invalid(`${edition} cannot compress writing space`)
      try { validateAnswerBoxHeights(entry.answerBoxHeightsMm) } catch (error) {
        invalid(`${edition} ${error.message}`)
      }
    }
    const expectedTarget = product
      ? studentProductPolicy(edition, 2, { economyPageLimit }).targetPages
      : { friendly8: 8, friendly10: 10, long10: 10, long12: 12 }[edition]
    const expectedListening = edition === 'friendly10' || edition === 'long12' || edition === 'largeComplete'
    if (entry.targetPages !== expectedTarget || entry.includeListening !== expectedListening) {
      invalid(`${edition} target/listening policy was changed`)
    }
    if (expectedListening && listeningSlotCount !== 2) {
      invalid(`${edition} requires exactly two listening slots`)
    }
    // New plans retain the opening. Keep already-bound historical eight-page
    // listening-excluded plans replayable; never silently rewrite their digest.
    if (entry.omitCover !== false && !(entry.omitCover === true && edition === 'friendly8' && sourceHasListening)) {
      invalid(`${edition} cover policy is not allowed for this source`)
    }
    if (entry.allowSplitOptionBank !== undefined
      && typeof entry.allowSplitOptionBank !== 'boolean') {
      invalid(`${edition} allowSplitOptionBank must be boolean`)
    }
    if (edition.startsWith('long') && entry.allowSplitOptionBank === true) {
      invalid(`${edition} cannot split the option bank`)
    }
    if (!(entry.omitCover || product ? [null] : FIXED_PAGE_COVER_GAPS_PT).some((value) =>
      JSON.stringify(value) === JSON.stringify(entry.coverGapsPt))) {
      invalid(`${edition} cover gap is outside the bounded choices`)
    }
    if (!Array.isArray(entry.breakSlotIds)
      || new Set(entry.breakSlotIds).size !== entry.breakSlotIds.length
      || entry.breakSlotIds.some((slotId) => !bindingBySlot.has(slotId))) {
      invalid(`${edition} break slots are unknown or duplicated`)
    }
    if (entry.breakSlotIds.some((slotId) =>
      !entry.includeListening && bindingBySlot.get(slotId).familyContractId === 'listening')) {
      invalid(`${edition} cannot break at an excluded listening group`)
    }
    if (entry.breakSlotIds.some((slotId, index, values) =>
      index > 0 && order.get(values[index - 1]) >= order.get(slotId))) {
      invalid(`${edition} break slots are out of canonical order`)
    }
  }
  return structuredClone(plan)
}

export function paginationSlotBindings(consumption) {
  return (consumption?.visibleStructure || []).filter((node) => node.kind === 'group').map((node) => ({
    slotId: node.slotId,
    groupId: node.groupId,
    familyContractId: node.familyContractId,
  }))
}

export function loadPaperPaginationPlan(rootDir, identity) {
  const filePath = path.join(rootDir, PAPER_PAGINATION_PLAN_FILE_NAME)
  if (!existsSync(filePath)) return null
  let plan
  try { plan = JSON.parse(readFileSync(filePath, 'utf8')) } catch { invalid('file is not JSON') }
  const validated = validatePaperPaginationPlan(plan, identity)
  return { plan: validated, digest: digestJson(validated), filePath }
}

export function loadBoundPaperPaginationPlan(rootDir, identity) {
  const planPath = path.join(rootDir, PAPER_PAGINATION_PLAN_FILE_NAME)
  const metaPath = path.join(rootDir, 'import-meta.json')
  let importMeta
  try { importMeta = JSON.parse(readFileSync(metaPath, 'utf8')) } catch { invalid('import-meta binding is missing or invalid') }
  const binding = importMeta.paginationPlanBinding
  if (binding === undefined) {
    if (existsSync(planPath)) invalid('pagination plan has no external import-meta binding')
    return null
  }
  exactKeys(binding, [
    'schemaVersion',
    'paperId',
    'sourceAssetVersion',
    'sourceDigest',
    'canonicalSourceDigest',
    'candidateDigest',
    'planDigest',
  ], 'import-meta pagination binding')
  if (binding.schemaVersion !== 'paper-pagination-binding-v1'
    || binding.paperId !== identity.paperId
    || binding.sourceAssetVersion !== identity.sourceAssetVersion
    || binding.canonicalSourceDigest !== identity.sourceDigest) {
    invalid('import-meta pagination binding does not match the canonical paper source/version')
  }
  if (binding.planDigest === null) {
    if (existsSync(planPath)) invalid('pagination plan exists despite an explicit null binding')
    return { plan: null, digest: null, binding: structuredClone(binding), filePath: null }
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(binding.planDigest || '')) invalid('bound plan digest is invalid')
  if (!existsSync(planPath)) invalid('externally committed pagination plan is missing')
  let plan
  try { plan = JSON.parse(readFileSync(planPath, 'utf8')) } catch { invalid('file is not JSON') }
  if (digestJson(plan) !== binding.planDigest) invalid('pagination plan differs from its import-meta commitment')
  const validated = identity.validatePlanIdentity === false
    ? structuredClone(plan)
    : validatePaperPaginationPlan(plan, {
        ...identity,
        sourceDigest: binding.sourceDigest,
        candidateDigest: binding.candidateDigest,
      })
  return {
    plan: validated,
    digest: binding.planDigest,
    binding: structuredClone(binding),
    filePath: planPath,
  }
}

export function paginationPlanEdition(plan, edition, slotBindings) {
  const entry = plan?.editions?.[edition]
  if (!entry) return null
  const groupBySlot = new Map(slotBindings.map(({ slotId, groupId }) => [slotId, groupId]))
  return {
    ...structuredClone(entry),
    allowSplitOptionBank: entry.allowSplitOptionBank ?? false,
    edition,
    plannedBreakGroupIds: entry.breakSlotIds.map((slotId) => groupBySlot.get(slotId)),
  }
}
