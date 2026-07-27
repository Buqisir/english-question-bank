import { layoutAbcdOptionSet } from './abcdLayout.mjs'
import { digestJson } from './stable.mjs'

const SUPPORTED_FAMILIES = new Set(['cloze', 'grammar-fill', 'seven-choices'])

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

function placementSignature(plan) {
  if (plan.status !== 'selected') return null
  return digestJson({
    mode: plan.mode,
    rowWidthTwip: plan.rowWidthTwip,
    placements: plan.placements.map((placement) => ({
      label: placement.label,
      row: placement.row,
      column: placement.column,
      startTwip: placement.startTwip,
      continuationStartTwip: placement.continuationStartTwip,
    })),
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
    || !['canonical', 'legacy'].includes(familySelections[0].mode)
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

function selectOccurrence(input) {
  const { familyContractId, groupId } = input
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
  const occurrences = selection.projectedOccurrences.filter(
    (occurrence) => occurrence?.kind === 'group' && occurrence.groupId === groupId,
  )
  if (occurrences.length !== 1) {
    throw rejected(`Canonical occurrence ${groupId} is missing or duplicated`)
  }
  return occurrences[0]
}

/**
 * Shared post-loader projection for Screen, Print/PDF, and DOCX.
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
  if (
    !Array.isArray(occurrence.numbering)
    || !Array.isArray(occurrence.blanks)
    || occurrence.numbering.length !== occurrence.blanks.length
  ) {
    throw rejected(`Canonical occurrence ${groupId} has incomplete Question/Blank identity`)
  }

  const numberByQuestionId = new Map()
  const questionIdByBlankId = new Map()
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
    ) {
      throw rejected(`Canonical occurrence ${groupId} has invalid Blank joins`)
    }
    questionIdByBlankId.set(blank.blankId, blank.questionId)
    blankQuestionIds.add(blank.questionId)
  }
  if (
    blankQuestionIds.size !== numberByQuestionId.size
    || [...numberByQuestionId.keys()].some(
      (questionId) => !blankQuestionIds.has(questionId),
    )
  ) throw rejected(`Canonical occurrence ${groupId} does not join every Question to one Blank`)

  const seenBlanks = new Set()
  const paragraphs = occurrence.content?.blocks?.map((block) => {
    if (block?.kind !== 'paragraph' || typeof block.nodeId !== 'string' || !Array.isArray(block.inlines)) {
      throw rejected(`Canonical occurrence ${groupId} contains an unsupported content block`)
    }
    return {
      paragraphId: block.nodeId,
      nodes: block.inlines.map((inline) => {
        if (inline?.kind === 'text' && typeof inline.text === 'string') {
          return { type: 'text', text: inline.text }
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
      : layoutAbcdOptionSet({
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
      placementSignature: layoutPlan ? placementSignature(layoutPlan) : null,
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
