import { array, escapeHtml, nonEmptyString } from './text.mjs'

export function cleanPaperTitle(title) {
  return nonEmptyString(title).replace(/[-—－]\s*答案版\s*$/u, '') || '英语试题'
}

export function renderPaperTitle(title) {
  const match = title.match(/^(.*全国统一考试)([（(][^）)]+[）)].*)$/u)
  return match ? `${escapeHtml(match[1])}<br><span>${escapeHtml(match[2])}</span>` : escapeHtml(title)
}

export function safeFileTitle(title) {
  return cleanPaperTitle(title).replace(/[\\/:*?"<>|]/gu, '-')
}

export function passageQuote(group, paragraphId, quote) {
  const paragraph = array(group.passage?.paragraphs).find(item => item.paragraphId === paragraphId)
  return quote && paragraph?.text.includes(quote) ? quote : ''
}

export function orderedGroups(paperAsset) {
  const groups = paperAsset?.content?.groups || {}
  const parts = array(paperAsset?.layoutTree?.parts)
  const entryFor = (group, title) => ({ group, title, answers: groupAnswers(paperAsset, group) })
  if (parts.length === 0) {
    return [{
      title: '答案与解析',
      sections: [{
        title: '全部题目',
        groups: Object.values(groups).filter(Boolean).map((group) => entryFor(group, group.title || '')),
      }],
    }]
  }
  return parts.map((part) => ({
    title: nonEmptyString(part?.title),
    sections: array(part?.sections).map((section) => ({
      title: nonEmptyString(section?.title),
      groups: array(section?.groups).flatMap((entry) => {
        const group = groups[entry?.groupId]
        return group ? [entryFor(group, nonEmptyString(entry?.title))] : []
      }),
    })),
  }))
}

export function questionData(paperAsset, questionId) {
  return paperAsset?.content?.questions?.[questionId] || null
}

export function answerData(paperAsset, questionId) {
  return paperAsset?.answerKey?.answers?.[questionId] || null
}

export function answerOptionText(question, answer) {
  return nonEmptyString(array(question?.options).find((option) => option?.label === answer)?.text)
}

export function groupAnswers(paperAsset, group) {
  return array(group.questionIds).flatMap((questionId) => {
    const question = questionData(paperAsset, questionId)
    const answer = answerData(paperAsset, questionId)
    return question && nonEmptyString(answer?.answer)
      ? [{ questionId, number: question.questionNo, value: answer.answer, provenance: answer.provenance }]
      : []
  })
}
