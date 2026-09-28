import {
  projectCanonicalConsumerGroup,
  selectedFamilyContractIdForGroup,
} from '../paper-canonical/consumerProjection.mjs'
import { buildSelectionSourceFromConsumption } from '../paper-selection/sourceProjection.mjs'

const WRITING_FAMILIES = new Set(['application-writing', 'continuation-writing'])
const WRITING_GROUP_TYPES = new Set(['writing', 'continuation'])

function visibleGroupIds(consumption) {
  const groupIds = []
  for (const item of consumption.visibleStructure || []) {
    if (item?.kind === 'group' && typeof item.groupId === 'string') groupIds.push(item.groupId)
  }
  if (groupIds.length === 0) {
    for (const selection of consumption.selections || []) {
      for (const groupId of selection.groupIds || []) groupIds.push(groupId)
    }
  }
  return groupIds
}

/*
 * The selection source only has text streams, and blank-only questions
 * (grammar fill, seven choices) have no stem or option text. Personal
 * commentary binds to the Question itself, so its valid targets come from
 * the same Canonical group projection instead of from visible text.
 */
export function buildPersonalLayerSource(consumption) {
  const selection = buildSelectionSourceFromConsumption(consumption)
  const questions = []
  const writingTasks = []
  for (const groupId of visibleGroupIds(consumption)) {
    try {
      const familyContractId = selectedFamilyContractIdForGroup({ consumption, groupId })
      const projected = projectCanonicalConsumerGroup({ consumption, familyContractId, groupId })
      if (WRITING_FAMILIES.has(familyContractId) || WRITING_GROUP_TYPES.has(projected.groupType)) {
        writingTasks.push(groupId)
        continue
      }
      for (const question of projected.questions || []) {
        if (typeof question?.questionId === 'string') questions.push({ groupId, questionId: question.questionId })
      }
    } catch {
      // A group that cannot be projected cannot carry commentary either.
    }
  }
  return Object.freeze({
    ...selection,
    commentaryTargets: Object.freeze({
      questions: Object.freeze(questions.map((target) => Object.freeze(target))),
      writingTasks: Object.freeze(writingTasks),
    }),
  })
}

export function personalCommentaryTargetExists(source, target) {
  if (!target || typeof target.groupId !== 'string') return false
  const targets = source.commentaryTargets
  if (target.kind === 'question') {
    if (targets) {
      return targets.questions.some((item) => item.groupId === target.groupId && item.questionId === target.questionId)
    }
    return source.streams.some((stream) => stream.groupId === target.groupId && stream.leaves.some(
      (leaf) => (leaf.kind === 'question-stem' && leaf.id === target.questionId)
        || (leaf.kind === 'option' && leaf.id.startsWith(`${target.questionId}:`)),
    ))
  }
  if (target.kind === 'writing-task') {
    if (targets) return targets.writingTasks.includes(target.groupId)
    return source.streams.some((stream) => stream.groupId === target.groupId
      && (stream.role === 'writing-prompt' || stream.role === 'writing-material'))
  }
  return false
}
