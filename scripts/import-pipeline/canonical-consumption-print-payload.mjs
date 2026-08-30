import { projectCanonicalConsumerGroup } from '../../shared/paper-canonical/consumerProjection.mjs'

function groupTypeForPrint(groupType) {
  if (groupType === 'grammarFill') return 'grammar_cloze'
  if (groupType === 'sevenChoices') return 'seven_choices'
  if (groupType === 'continuation') return 'writing'
  return groupType
}

export function canonicalConsumptionPrintPayload(
  consumption,
  title = consumption.paperId,
  answerByQuestionId = new Map(),
) {
  const groups = []
  for (const selection of consumption.selections) {
    for (const groupId of selection.groupIds) {
      const group = projectCanonicalConsumerGroup({
        consumption,
        familyContractId: selection.familyContractId,
        groupId,
      })
      groups.push({
        detail: {
          id: groupId,
          paperId: consumption.paperId,
          title: groupId,
          source: consumption.paperId,
          groupType: groupTypeForPrint(group.groupType),
          passage: { title: groupId, materialText: '' },
          questions: group.questions.map((question) => ({
            id: question.questionId,
            questionNo: String(question.questionNo),
            stem: question.stem ?? '',
            answer: answerByQuestionId.get(question.questionId)
              ?? (question.correctOptionId
                ? question.options.find(
                  (option) => option.optionId === question.correctOptionId,
                )?.label || ''
                : ''),
            explanation: '',
            note: '',
            options: question.options.map((option) => ({
              label: option.label,
              content: option.text,
            })),
          })),
        },
        score: 0,
        sectionTitle: '',
        note: '',
      })
    }
  }
  const details = new Map(groups.map((group) => [group.detail.id, group.detail]))
  const blocks = consumption.visibleStructure.flatMap((node) => {
    if (node.kind === 'group') {
      return [{ type: 'question_group', questionGroupId: node.groupId }]
    }
    if (node.kind !== 'instruction' || node.renderPolicy !== 'render') return []
    if (node.placement === 'part_heading' || node.placement === 'section_heading') {
      return [{
        type: 'section_header',
        title: node.text,
        instructionId: node.instructionId,
      }]
    }
    if (node.placement === 'group_instruction') {
      return [{
        type: 'instruction',
        text: node.text,
        instructionId: node.instructionId,
      }]
    }
    return []
  })
  return {
    title,
    printStyle: 'exam',
    questionNumberStart: 1,
    items: groups.map((group) => ({ questionGroupId: group.detail.id })),
    blocks,
    details,
  }
}
