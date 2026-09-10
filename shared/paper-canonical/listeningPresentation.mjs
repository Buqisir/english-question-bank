import profile from '../../standards/paper-canonical/profiles/nck1-v16.json' with { type: 'json' }

const instructions = profile.instructions

export const listeningOpening = Object.freeze({
  title: '英 语',
  notices: Object.freeze([
    '答卷前，考生务必将自己的姓名、准考证号填写在答题卡上。',
    '回答选择题时，选出每小题答案后，用铅笔把答题卡上对应题目的答案标号涂黑。如需改动，用橡皮擦干净后，再选涂其他答案标号。回答非选择题时，将答案写在答题卡上，写在本试卷上无效。',
    '考试结束后，将本试卷和答题卡一并交回。',
  ]),
  transferNotice: '做题时，先将答案标在试卷上。录音内容结束后，你将有两分钟的时间将试卷上的答案转涂到答题卡上。',
})

function instruction(id) {
  return instructions[id].text
}

function section1Instruction(playback) {
  const source = instruction('listening.short-dialogue.prompt')
  return playback === 'once_explicit'
    ? source
    : source.replace('每段对话仅读一遍。', '每段录音播放两遍。')
}

export function listeningSegmentCue(segment, ordinal, questions) {
  const numberById = new Map(questions.map(({ questionId, questionNo }) => [questionId, questionNo]))
  const numbers = segment.questionIds.map((questionId) => numberById.get(questionId))
  if (numbers.some((number) => !Number.isInteger(number)) || numbers.length === 0) {
    throw new Error(`Listening segment ${segment.segmentId} has invalid Question identities`)
  }
  const contiguous = numbers.every((number, index) => index === 0 || number === numbers[index - 1] + 1)
  const range = numbers.length === 1
    ? `${numbers[0]}`
    : contiguous && numbers.length > 2 ? `${numbers[0]}至${numbers.at(-1)}` : numbers.join('、')
  return `听第${ordinal}段材料，回答第${range}题。`
}

export function projectListeningGroupPresentation(group) {
  if (group?.groupType !== 'listening') return null
  const short = group.questions[0]?.questionNo <= 5
  return Object.freeze({
    partHeading: short ? instruction('part.listening') : null,
    transferNotice: short ? listeningOpening.transferNotice : null,
    sectionHeading: instruction(short
      ? 'section.listening.short-dialogue'
      : 'section.listening.long-form'),
    instruction: short
      ? section1Instruction(group.firstSectionPlayback ?? 'twice_default')
      : instruction('listening.long-form.prompt'),
    example: short ? Object.freeze({
      stem: 'How much is the shirt?',
      options: Object.freeze([
        { label: 'A', text: '£19.15' },
        { label: 'B', text: '£9.18' },
        { label: 'C', text: '£9.15' },
      ]),
      answer: 'C',
    }) : null,
    segmentCues: short ? [] : group.segments.map((segment, index) => ({
      beforeQuestionId: segment.questionIds[0],
      text: listeningSegmentCue(segment, index + 6, group.questions),
    })),
  })
}

export function ownsCompletePaperOpening(consumption, renderedGroupIds) {
  if (!Array.isArray(renderedGroupIds) || ![9, 11].includes(renderedGroupIds.length)) return false
  const occurrences = consumption?.selections?.flatMap((selection) =>
    selection?.mode === 'canonical' ? selection.projectedOccurrences ?? [] : [])
    .filter((occurrence) => renderedGroupIds.includes(occurrence.groupId)) ?? []
  const expectedSlots = [
    ...(renderedGroupIds.length === 11 ? ['listening.short-dialogue', 'listening.long-form'] : []),
    'reading.a', 'reading.b', 'reading.c', 'reading.d',
    'reading.seven-choices', 'language.cloze', 'language.grammar-fill',
    'writing.application', 'writing.continuation',
  ]
  const slots = new Map(occurrences.map((occurrence) => [occurrence?.slotId, occurrence]))
  if (occurrences.length !== expectedSlots.length || slots.size !== expectedSlots.length) return false
  if (expectedSlots.some((slotId, index) => slots.get(slotId)?.groupId !== renderedGroupIds[index])) return false
  const paperIds = new Set(occurrences.map((occurrence) => occurrence.paperId ?? consumption.paperId))
  return paperIds.size === 1 && !paperIds.has(undefined)
}
