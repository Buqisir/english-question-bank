import { projectCanonicalConsumerGroup } from './consumerProjection.mjs'
import { assertCanonicalConsumptionVisibleStructure } from './visibleStructure.mjs'

function rejected(message) {
  const error = new Error(message)
  error.code = 'CANONICAL_PAPER_BROWSE_DISPLAY_REJECTED'
  return error
}

function blockForVisibleNode(node) {
  if (node.kind === 'group') return { type: 'group', groupId: node.groupId }
  if (node.kind !== 'instruction' || node.renderPolicy !== 'render') return null
  if (node.placement === 'part_heading') {
    return { type: 'partHeading', partId: node.instructionId, text: node.text }
  }
  if (node.placement === 'section_heading') {
    return { type: 'sectionHeading', sectionId: node.instructionId, text: node.text }
  }
  if (node.placement === 'group_instruction') {
    return { type: 'instruction', instructionId: node.instructionId, text: node.text }
  }
  return null
}

function displayGroupType(familyContractId) {
  if (familyContractId === 'seven-choices') return 'sevenChoices'
  if (familyContractId === 'grammar-fill') return 'grammarFill'
  if (['application-writing', 'continuation-writing'].includes(familyContractId)) {
    return 'writing'
  }
  return familyContractId
}

/**
 * Produce a non-authoritative PaperBrowse shell from one committed Screen
 * Consumption Plan. Canonical projected occurrences remain the only source of
 * Group, Question, numbering, and option identity.
 */
export function projectCanonicalPaperBrowseDisplayAsset(consumption) {
  if (
    consumption?.disposition !== 'ready'
    || typeof consumption.paperId !== 'string'
    || !Array.isArray(consumption.visibleStructure)
    || !Array.isArray(consumption.selections)
  ) throw rejected('PaperBrowse display projection requires one ready whole-paper Screen Consumption Plan')
  assertCanonicalConsumptionVisibleStructure(consumption)

  const groups = {}
  const questions = {}
  const seenGroupIds = new Set()
  for (const selection of consumption.selections) {
    if (selection?.mode !== 'canonical' || !Array.isArray(selection.groupIds)) {
      throw rejected('PaperBrowse display projection accepts only canonical Group selections')
    }
    for (const groupId of selection.groupIds) {
      if (seenGroupIds.has(groupId)) {
        throw rejected(`PaperBrowse display Group is duplicated: ${groupId}`)
      }
      seenGroupIds.add(groupId)
      const projected = projectCanonicalConsumerGroup({
        consumption,
        familyContractId: selection.familyContractId,
        groupId,
      })
      const questionIds = Array.isArray(projected.questions)
        ? projected.questions.map((question) => question.questionId)
        : []
      groups[groupId] = {
        groupId,
        groupType: displayGroupType(selection.familyContractId),
        title: groupId,
        questionIds,
        ...(selection.familyContractId === 'seven-choices' && projected.optionBank
          ? {
              optionBank: projected.optionBank.options.map((option) => ({
                label: option.label,
                text: option.text,
              })),
            }
          : {}),
      }
      for (const question of projected.questions || []) {
        if (
          typeof question.questionId !== 'string'
          || !Number.isInteger(question.questionNo)
          || questions[question.questionId]
        ) throw rejected(`PaperBrowse display Question identity is invalid in ${groupId}`)
        questions[question.questionId] = {
          questionId: question.questionId,
          questionNo: question.questionNo,
          groupId,
          stem: typeof question.stem === 'string' ? question.stem : '',
          ...(Array.isArray(question.options) && question.options.length > 0
            ? {
                options: question.options.map((option) => ({
                  label: option.label,
                  text: typeof option.text === 'string' ? option.text : '',
                })),
              }
            : {}),
          ...(typeof question.blankId === 'string' ? { blankId: question.blankId } : {}),
        }
      }
    }
  }
  const visibleGroupIds = consumption.visibleStructure
    .filter((node) => node.kind === 'group')
    .map((node) => node.groupId)
  if (
    visibleGroupIds.length !== seenGroupIds.size
    || visibleGroupIds.some((groupId) => !seenGroupIds.has(groupId))
  ) throw rejected('PaperBrowse display projection does not close the visible Canonical Group set')

  return {
    schemaVersion: 'paper-asset-v1',
    paper: {
      paperId: consumption.paperId,
      title: consumption.paperId,
      subject: 'English',
      source: 'Committed Canonical Paper',
      assetVersion: consumption.sourceAssetVersion,
      status: 'published',
    },
    sources: { primarySourceType: 'pdf' },
    layoutTree: { parts: [] },
    content: {
      blocks: consumption.visibleStructure.map(blockForVisibleNode).filter(Boolean),
      groups,
      questions,
    },
    answerKey: { answers: {} },
    analysis: {},
  }
}
